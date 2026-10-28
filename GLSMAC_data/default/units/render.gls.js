// Shared application rendering policy for map definitions and Workshop previews.
// Only the stock Former chassis has a verified installed component binding.
const model_preview = #include('./model_previews');
return (entry) => {
	const preview = model_preview(entry);
	if (preview != null) { return preview; }
	return {type: 'sprite', file: 'newicons.pcx', x: 79, y: 501, w: 38, h: 48, cx: 98, cy: 549};
};
