chrome.runtime.onInstalled.addListener(() => {
    chrome.runtime.setUninstallURL('http://localhost:3000/uninstall.html');
});

chrome.runtime.onInstalled.addListener(({reason}) => {
  if (reason === 'install') {
    chrome.tabs.create({
      url: "onboarding.html"
    });
  }
});

chrome.pageCapture.saveAsMHTML();

// extract the total number of scribe titles on the page
// need to detect the langauge of the tab, and communicate with the content script of the tab
// chrome.tabs.onActivated.addListener(function (tab) {
//   chrome.tabs.query({active: true, currentWindow: true }, function (tabs) {
//     var activeTab = tabs[0];
//     // let manifest = require("../manifest.json");
//     // console.log(activeTab);
//     // if (activeTab == manifest.content_scripts.matches[0]){
//     //   console.log("worked");
//     // }

//     // send message to active tab
//     chrome.tabs.sendMessage(activeTab.id, {msg:"demo"}, function
//       (response){
//         console.log(response);
//       });
//     });
//   });