return (menu, p) => {
 const root = menu.menus.left_menu; const state = {alive: true};
 root.el.on('remove', () => { state.alive = false; });
 for (header of menu.headers) {
  if (header.source == 'HQ') {
   for (entry of header.entries) {
    if (#is_defined(entry.source_index) && entry.source_index == 7) {
     entry.open = () => {
      if (!state.alive || !root.is_open || !#is_defined(menu.menus.left_menu_hq) || !menu.menus.left_menu_hq.is_open || !#is_defined(p.modules) || !#is_defined(p.modules.base_operations)) { return; }
      p.modules.base_operations.open();
     };
    }
   }
  }
 }
};
