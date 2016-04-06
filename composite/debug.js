var debugEnabled = false;

var debugLog = function (source, message) {
  if (debugEnabled) {
    while (source.length < 35) {
      source += ' ';
    }
    console.log('[' + source + '] ' + message);
  }
};

debugLog.prototype.enableDebugLogging = function () {
  debugEnabled = true;
};

export default debugLog;
