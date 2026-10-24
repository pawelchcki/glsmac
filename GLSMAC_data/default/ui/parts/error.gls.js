return (m) => {

	let ui = m.glsmac.ui;

	ui.on('error', (e) => {

		const popup = m.root.window({
			class: 'window',
			title: 'ERROR',
			width: 640,
			height: 140,
			blocker: 'rgba(0, 0, 0, 120)',
		});

		let y = 20;
		for (paragraph of #split(e.error, '\n')) {
			let line = '';
			let node = popup.text({class: 'popup-text', left: 20, top: y, text: ''});
			for (word of #split(paragraph, ' ')) {
				const candidate = line == '' ? word : line + ' ' + word;
				node.text = candidate;
				if (node.get_width() > 590 && line != '') {
					node.text = line;
					y += 22;
					node = popup.text({class: 'popup-text', left: 20, top: y, text: word});
					line = word;
				} else { line = candidate; }
			}
			y += 22;
		}
		popup.height = y + 70;

		const footer = popup.panel({
			class: 'popup-footer',
		});
		const btn = footer.button({
			class: 'popup-button',
			text: 'OK',
			align: 'center',
			is_ok: true,
			is_cancel: true,
		});
		let closed = false;
		const f_on_close = () => {
			if (!closed) {
				closed = true;
				popup.remove();
				e.on_close();
			}
			return true;
		};
		btn.on('click', f_on_close);

	});

};
