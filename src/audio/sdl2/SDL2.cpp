#include <algorithm>

#define SDL_MAIN_HANDLED 1
#include <SDL.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/threading.h>
#endif

#include "SDL2.h"

#include "Sound.h"
#include "engine/Engine.h"
#include "config/Config.h"
#include "scene/actor/Sound.h"

namespace audio {
namespace sdl2 {

#ifdef __EMSCRIPTEN__
namespace {

struct OpenAudioRequest {
	SDL_AudioSpec* spec;
	std::string error;
};

int OpenBrowserAudio( OpenAudioRequest* request ) {
	const auto result = SDL_OpenAudio( request->spec, nullptr );
	if ( result < 0 ) {
		request->error = SDL_GetError();
	}
	return result;
}

}
#endif

SDL2::SDL2() {

}

SDL2::~SDL2() {
	std::lock_guard guard( m_actors_mutex );
	for ( auto& actor : m_actors ) {
		DELETE( actor.second );
	}
}

void SDL2_callback( void* userdata, Uint8* stream, int len ) {
	auto audio = (SDL2*)userdata;
	audio->Mix( stream, len );
}

void SDL2::Start() {

	if ( g_engine->GetConfig()->HasLaunchFlag( config::Config::LF_NOSOUND ) ) {
		return;
	}

	Log( "Initializing SDL2 Audio" );

	if ( SDL_Init( SDL_INIT_AUDIO ) ) {
		Log( "Failed to enable audio, game will start without sound." );
		return;
	}

	m_buffer_length = AUDIO_SAMPLES * AUDIO_CHANNELS;
	m_buffer_size = sizeof( AUDIO_SAMPLE_TYPE ) * m_buffer_length;
	m_mix_buffer_size = sizeof( AUDIO_MIX_TYPE ) * m_buffer_length;
	m_mix_buffer = (AUDIO_MIX_TYPE*)malloc( m_mix_buffer_size );
	m_buffer = (AUDIO_SAMPLE_TYPE*)malloc( m_buffer_size );

	SDL_AudioSpec wav_spec = {};
	wav_spec.freq = AUDIO_FREQUENCY;
	wav_spec.format = AUDIO_FORMAT;
	wav_spec.channels = AUDIO_CHANNELS;
	wav_spec.samples = AUDIO_SAMPLES;
	wav_spec.callback = SDL2_callback;
	wav_spec.userdata = this;

	/* Open the audio device */
#ifdef __EMSCRIPTEN__
	// SDL's Emscripten backend queries AudioContext with thread-local JS.
	// Open the whole device on the browser thread, where that context lives.
	OpenAudioRequest request = { &wav_spec, {} };
	auto ret = emscripten_sync_run_in_main_runtime_thread( EM_FUNC_SIG_IP, &OpenBrowserAudio, &request );
#else
	auto ret = SDL_OpenAudio( &wav_spec, NULL );
#endif
	if ( ret < 0 ) {
#ifdef __EMSCRIPTEN__
		const auto* error = request.error.c_str();
#else
		const auto* error = SDL_GetError();
#endif
		Log( (std::string)"Couldn't open audio: " + error );
		Log( "Failed to enable audio, game will start without sound." );
		free( m_buffer );
		free( m_mix_buffer );
		m_buffer = nullptr;
		m_mix_buffer = nullptr;
		return;
	}

	m_is_sound_enabled = true;

	/* Start playing */
#ifdef __EMSCRIPTEN__
	emscripten_sync_run_in_main_runtime_thread( EM_FUNC_SIG_VI, &SDL_PauseAudio, 0 );
#else
	SDL_PauseAudio( 0 );
#endif
}

void SDL2::Stop() {
	if ( !m_is_sound_enabled ) {
		return;
	}

	Log( "Deinitializing SDL2" );
#ifdef __EMSCRIPTEN__
	// Finish removing browser callbacks before their C++ buffers are freed.
	emscripten_sync_run_in_main_runtime_thread( EM_FUNC_SIG_V, &SDL_CloseAudio );
#else
	SDL_CloseAudio();
#endif
	m_is_sound_enabled = false;

	free( m_buffer );
	free( m_mix_buffer );
	m_buffer = nullptr;
	m_mix_buffer = nullptr;

}

void SDL2::Iterate() {
	if ( !m_is_sound_enabled ) {
		return;
	}

	Audio::Iterate();
}

void SDL2::AddActor( scene::actor::Sound* actor ) {
	if ( !m_is_sound_enabled ) {
		return;
	}

	std::lock_guard guard( m_actors_mutex );

	// check if same sound was double-added (can happen if two popups close at same time, for example)
	// in this case we'll ignore second sound to avoid volume spike
	for ( const auto& a : m_actors ) {
		if ( a.first->GetPos() == 0 && a.first->GetSound() == actor->GetSound() ) {
			Log( "Muting " + actor->GetName() + " to prevent double-sound" );
			actor->Mute();
		}
	}

	//Log( "Adding sound actor " + actor->GetName() );
	ASSERT( m_actors.find( actor ) == m_actors.end(), "sound actor already added" );
	NEWV( sound_actor, Sound, actor );
	m_actors[ actor ] = sound_actor;
}

void SDL2::RemoveActor( scene::actor::Sound* actor ) {
	if ( !m_is_sound_enabled ) {
		return;
	}

	std::lock_guard guard( m_actors_mutex );

	//Log( "Removing sound actor " + actor->GetName() );
	auto it = m_actors.find( actor );
	ASSERT( it != m_actors.end(), "sound actor not found" );
	DELETE( it->second );
	m_actors.erase( it );
}

void SDL2::Mix( Uint8* stream, int len ) {
	ASSERT( m_is_sound_enabled, "SDL2::Mix() called while sound not enabled" );
	ASSERT( len == m_buffer_size, "sample type or size mismatch" );

	memset( ptr( m_mix_buffer, 0, m_mix_buffer_size ), 0, m_mix_buffer_size );
	{
#ifdef __EMSCRIPTEN__
		std::unique_lock guard( m_actors_mutex, std::try_to_lock );
		if ( !guard.owns_lock() ) {
			SDL_memset( stream, 0, len );
			return;
		}
#else
		std::lock_guard guard( m_actors_mutex );
#endif

		for ( auto& actor : m_actors ) {
			if ( actor.second->IsActive() ) {
				actor.second->GetNextBuffer( (uint8_t*)m_buffer, len );
				for ( size_t i = 0 ; i < m_buffer_length ; i++ ) {
					m_mix_buffer[ i ] = m_mix_buffer[ i ] + m_buffer[ i ] * actor.second->GetVolume() * AUDIO_VOLUME * pow( AUDIO_VOLUME_LOWERING_FROM_ACTORS, m_actors.size() );
				}
			}
		}
	}
	for ( size_t i = 0 ; i < m_buffer_length ; i++ ) {
		m_buffer[ i ] = floor( m_mix_buffer[ i ] );
	}

	SDL_memcpy( stream, (uint8_t*)m_buffer, len );
}

}
}
