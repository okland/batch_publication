import AbstractCursor from './abstract-cursor.js';
/**
 * An cursor representing a middleware
 */
class MiddlewareCursorClass extends AbstractCursor {
  constructor(abstractCursor, middleware) {
    super();
    this.abstractCursor = abstractCursor;
    this.middleware = middleware;
  }

  observeChanges(callbacks) {
    this.middleware.finalCallbacks = callbacks;
    this.handle = this.abstractCursor.observeChanges(this.middleware.callbacks);
    return {
      stop : this.stop.bind(this)
    };
  }

  getCache() {
    return this.middleware.getCache();
  }

  stop() {
    this.handle && this.handle.stop();
    this.middleware && this.middleware.clean && this.middleware.clean();
    this.abstractCursor.stop();
  }

  isUsingOplog() {
    this.abstractCursor.isUsingOplog();
  }
}

var MiddlewareCursor = MiddlewareCursorClass;
export default MiddlewareCursor;
