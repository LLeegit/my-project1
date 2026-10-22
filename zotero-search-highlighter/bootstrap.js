var scope;
async function startup(data, reason) {
  scope = { Zotero, Services };
  Services.scriptloader.loadSubScriptWithOptions(data.rootURI + 'content/plugin.js', {
    target: scope,
    ignoreCache: true,
    allowUnsafeURL: true
  });
  await scope.ZSH.startup();
}
function onMainWindowLoad({ window }) { scope?.ZSH.attach(window); }
function onMainWindowUnload({ window }) { scope?.ZSH.detach(window); }
function shutdown(data, reason) {
  scope?.ZSH.shutdown();
  scope = undefined;
}
function install() {}
function uninstall() {}
