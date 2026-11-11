// Exercise the real SDK's synchronous proxy API under a controlled handoff.
// Wrappers observe context retirement; they do not replace the proxy algorithm.
#include <assert.h>
#include <emscripten/proxying.h>
#include <emscripten/stack.h>
#include <emscripten/threading.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>

static _Atomic int unlocked;
static _Atomic int retired;
static _Atomic int finished;
static _Atomic int late_signal;
static _Thread_local int caller;
static _Thread_local int completing;
static _Thread_local pthread_mutex_t* context_mutex;
static uintptr_t caller_stack_end;
static uintptr_t caller_stack_base;

int __real_pthread_mutex_lock(pthread_mutex_t* mutex);
int __real_pthread_mutex_unlock(pthread_mutex_t* mutex);
int __real_pthread_cond_signal(pthread_cond_t* condition);

int __wrap_pthread_mutex_lock(pthread_mutex_t* mutex) {
    uintptr_t address = (uintptr_t)mutex;
    // SDK queue locks are on the heap; the synchronous context is on the
    // caller's stack. Hold its initial lock until completion has unlocked it.
    if (caller && address >= caller_stack_end && address < caller_stack_base) {
        while (!atomic_load(&unlocked)) {}
    }
    if (completing && !context_mutex) context_mutex = mutex;
    return __real_pthread_mutex_lock(mutex);
}

int __wrap_pthread_mutex_unlock(pthread_mutex_t* mutex) {
    int result = __real_pthread_mutex_unlock(mutex);
    if (completing && mutex == context_mutex) {
        atomic_store(&unlocked, 1);
        // Let the synchronous caller consume DONE, destroy the context and
        // return before the completion thread resumes after its unlock.
        while (!atomic_load(&retired)) {}
    }
    return result;
}

int __wrap_pthread_cond_signal(pthread_cond_t* condition) {
    if (completing && atomic_load(&retired)) {
        atomic_store(&late_signal, 1);
        // Record the violation without dereferencing the retired context.
        return 0;
    }
    return __real_pthread_cond_signal(condition);
}

static void complete(em_proxying_ctx* context, void* argument) {
    (void)argument;
    completing = 1;
    emscripten_proxy_finish(context);
    completing = 0;
    atomic_store(&finished, 1);
}

int main(void) {
    caller_stack_end = emscripten_stack_get_end();
    caller_stack_base = emscripten_stack_get_base();
    em_proxying_queue* queue = em_proxying_queue_create();
    assert(queue);
    caller = 1;
    int result = emscripten_proxy_sync_with_ctx(queue, emscripten_main_runtime_thread_id(), complete, NULL);
    caller = 0;
    atomic_store(&retired, 1);
    while (!atomic_load(&finished)) {}
    em_proxying_queue_destroy(queue);
    assert(result);
    if (atomic_load(&late_signal)) {
        puts("PROXY_CONTEXT_RETIRED_BEFORE_SIGNAL");
        return 1;
    }
    puts("PROXY_CONTEXT_LIVE_DURING_SIGNAL");
    return 0;
}
