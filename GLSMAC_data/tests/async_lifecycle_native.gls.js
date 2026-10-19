// Actual Async dispatch, with equal deadlines and one native bucket step.
const behavior = #include('./_behavior');
behavior.scenario('cancelling a due sibling prevents its dispatch and removes the completed bucket', () => {
	const result = test.async_probe('cancel_sibling');
	test.assert(result.first_calls == 1 && result.second_calls == 0, 'a cancelled sibling must never run');
	test.assert(result.pending == 0 && result.buckets == 0, 'completed due bucket cannot retain stale callable roots');
});
behavior.scenario('self cancellation overrides callback repeat request', () => {
	const result = test.async_probe('self_cancel');
	test.assert(result.first_calls == 1 && result.second_calls == 0);
	test.assert(result.pending == 0 && result.buckets == 0);
});
behavior.scenario('a cancelled callback can create a replacement without resurrecting itself', () => {
	const result = test.async_probe('replacement');
	test.assert(result.pending_after_first == 1);
	test.assert(result.first_calls == 1 && result.second_calls == 1);
	test.assert(result.pending == 0 && result.buckets == 0);
});
behavior.scenario('ordinary repeat retains one timer then finishes cleanly', () => {
	const result = test.async_probe('repeat');
	test.assert(result.pending_after_first == 1);
	test.assert(result.first_calls == 2 && result.second_calls == 0);
	test.assert(result.pending == 0 && result.buckets == 0);
});
behavior.scenario('stopping all timers in a due callback cancels the copied siblings', () => {
	const result = test.async_probe('stop_all');
	test.assert(result.first_calls == 1 && result.second_calls == 0);
	test.assert(result.pending == 0 && result.buckets == 0);
});

behavior.scenario('independent schedulers return distinct handles that cancel only their own callback', () => {
	const result = test.async_probe('handles');
	test.assert(result.distinct && result.isolated && result.stopped);
	test.assert(result.first_calls == 0 && result.second_calls == 1 && result.pending == 0);
});
