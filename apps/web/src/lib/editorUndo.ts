import type * as Y from 'yjs';
// The editor plugin destroys its manager on unmount. A board owns the real manager;
// every editor gets a facade that releases only the listeners it registered.
export function editorUndoFacade(manager: Y.UndoManager): Y.UndoManager {
  type Event = Parameters<typeof manager.on>[0];
  type Callback = Parameters<typeof manager.on>[1];
  const listeners: Array<{ event: Event; callback: Callback }> = [];
  return new Proxy(manager, {
    get(target, property) {
      if (property === 'destroy')
        return () => {
          for (const { event, callback } of listeners) target.off(event, callback);
          listeners.length = 0;
        };
      if (property === 'on')
        return (event: Event, callback: Callback) => {
          listeners.push({ event, callback });
          return target.on(event, callback);
        };
      if (property === 'off')
        return (event: Event, callback: Callback) => {
          const index = listeners.findIndex(
            (item) => item.event === event && item.callback === callback,
          );
          if (index >= 0) listeners.splice(index, 1);
          return target.off(event, callback);
        };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
