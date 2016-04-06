var StreamStore = function (pub) {
  this.pub = pub;
};

StreamStore.prototype.beginUpdate = function () {
  this.queue = [];
};

StreamStore.prototype.update = function (updatedMessage) {
  this.queue.push(updatedMessage);
};

StreamStore.prototype.endUpdate = function () {
  var self = this;
  this.queue.forEach(function (msg) {
    switch (msg.msg) {
      case 'added':
        self.pub.added(msg.id, msg.fields);
        break;
      case 'changed':
        self.pub.changed(msg.id, msg.fields);
        break;
      case 'removed':
        self.pub.removed(msg.id);
        break;
      default :
        break;
    }
  });
  // Clean queue
  this.queue = [];
};

export default StreamStore;
