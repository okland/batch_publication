import {MongoID} from 'meteor/mongo-id';
import {DDPCommon} from 'meteor/ddp-common';

var DDPCommonBatch = {
  stringifyDDP : function (msg) {
    if (msg && msg.id && typeof msg.id == 'object') {
      msg.id = MongoID.idStringify(msg.id);
    }
    return DDPCommon.stringifyDDP(msg);
  }
};

export default DDPCommonBatch;
