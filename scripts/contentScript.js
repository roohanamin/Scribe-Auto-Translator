// // array of scribe blocks which store title, desc, etc. of the scribe
// const getScribeDocumentBlock = 
//     document.
//         getElementsByClassName(
//             "group peer flex-1 focus:rounded-[7px] focus:ring-2 focus:ring-inset focus:ring-brand-700 sm:focus:rounded-lg"
// );

// // array of scribe titles css selector
// const getScribeDocumentTitle = 
//     document.
//         getElementsByClassName(
//             "m-0 mb-3 line-clamp-2 text-sm font-semibold leading-5 text-slate-900 3xl:text-base"
// );
// // total number of scribe titles on the page
// let documentTitlesOnPage = getScribeDocumentTitle.length;

// for (let i = 0; i < documentTitlesOnPage; i++){
//     console.log(getScribeDocumentTitle.innerHTML);
// }

// listen to messages
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     console.log(message);
//     if (message.url.slice(0,21) != "https://scribehow.com") {
//         chrome.extensions.disable();
//     }
//     sendResponse(({ message: "Response from contentScript.js"}));
// });