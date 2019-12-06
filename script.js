// ==UserScript==
// @name         Skype Script
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Abusing web skype. Old code completely rewritten.
// @author       Jozhus
// @include      https://web.skype.com/en/
// @require      http://code.jquery.com/jquery-latest.js
// @grant        none
// ==/UserScript==
/* jshint -W097 */
'use strict';

/*
'regToken' can be found by posting any message and copying it from "RegistrationToken" in the request header
Create your own urlList. Get conversation URLs from "Request URL" in the general portion of any message request
Don't leave chaosmode (with low tickspeed) on too long or you could get blocked from sending requests for a while

//Commands\\
*Remove any parenthesis
*Replace spaces in Usernames with `
!grab (msgId)              //Sends the message linked to the msgId
!freemode                  //Toggles the ability for anyone (but the people on the exception list) to use commands
!chaos                     //Toggles chaos mode -- the scrambling of the current chat
!sticky (msgId/nothing)    //Sends msgId message whenever chat updates essentially keeping it at the bottom. If left empty, msgId = the message immediately before the command (!sticky to toggle off)
!target (Username) (msgId) //Sends msgId message whenever Username posts anything (!target to toggle off)
!getUrl                    //Gets the current set URL adress
!setUrl (key)              //Sets URL address to the value associated with key in urlList
!getUrlList                //Gets list of keys from urlList
!setToken (regToken)       //Set regToken
!setSpeed (integer)        //Changes tickspeed (lower = faster | higher = slower)
!frame (Username)          //Chaos mode but uses only the victim's posts
!confuse                   //Spams non-user-submitted messages (title changes, missed call messages, etc.)
*/

var xhttp = new XMLHttpRequest();
var messages = {};
var frameList = [];
var othersList = [];
var oldMsgId = "";
var newMsgId = "";
var stickyMsgId;
var targetName;
var targetMsgId;
var victim;
var tickSpeed = 300;

//Toggles
var chaosmode = false;
var freemode = false;
var sticky = false;
var target = false;
var frame = false;
var confuse = false;

var exclusionList = ["Paw_", "Cryostat"]; // ; ^)
var regToken;
var urlList = {};
var defaultUrl = urlList.newtest;

//Messy GUI crap

var padding = document.createElement('p');
var urlEl = document.createElement('p');
var speedEl = document.createElement('p');
var freemEl = document.createElement('p');
var chaosmEl = document.createElement('p');
var stickyEl = document.createElement('p');
var targetEl = document.createElement('p');
var frameEl = document.createElement('p');
var confuseEl = document.createElement('p');
padding.setAttribute("class", "smaller");
padding.innerHTML = "&nbsp;&nbsp;·&nbsp;&nbsp;";
urlEl.setAttribute("class", "smaller");
urlEl.innerHTML = "Current URL: " + getKey(defaultUrl);
speedEl.setAttribute("class", "smaller");
speedEl.innerHTML = "Tick Speed: " + tickSpeed + "ms";
freemEl.setAttribute("class", "smaller");
freemEl.innerHTML = "Free Mode";
freemEl.style.color = "red";
chaosmEl.setAttribute("class", "smaller");
chaosmEl.innerHTML = "Chaos Mode";
chaosmEl.style.color = "red";
stickyEl.setAttribute("class", "smaller");
stickyEl.innerHTML = "Sticky: None";
targetEl.setAttribute("class", "smaller");
targetEl.innerHTML = "Targetting: None";
frameEl.setAttribute("class", "smaller");
frameEl.innerHTML = "Victim: None";
confuseEl.setAttribute("class", "smaller");
confuseEl.innerHTML = "Confuse";
confuseEl.style.color = "red";

//Waits till a few elements load before editing them
//Otherwise loading takes like 5x longer / errors
setTimeout(function() {
    //Delete legal crap
    document.getElementsByClassName('shell footer')[0].removeChild(document.getElementsByClassName('shell footer')[0].children[1]);

    //Move "GUI" to the top of the page
    //Would get covered by tooltip things on the bottom
    document.body.insertBefore(document.getElementsByClassName('shell footer')[0], document.getElementsByClassName('shell mainStage')[0]);

    var things = [];

    for (var k = 1; k < document.getElementsByClassName('app')[0].children.length; k++)
    {
        things.push(document.getElementsByClassName('app')[0].children[k]);
    }

    while (things.length > 0)
    {
        document.getElementsByClassName('app')[0].removeChild(things.pop());
    }

    document.getElementsByClassName('app')[0].appendChild(urlEl);
    document.getElementsByClassName('app')[0].appendChild(padding.cloneNode(true));
    document.getElementsByClassName('app')[0].appendChild(speedEl);
    document.getElementsByClassName('app')[0].appendChild(padding.cloneNode(true));
    document.getElementsByClassName('app')[0].appendChild(freemEl);
    document.getElementsByClassName('app')[0].appendChild(padding.cloneNode(true));
    document.getElementsByClassName('app')[0].appendChild(chaosmEl);
    document.getElementsByClassName('app')[0].appendChild(padding.cloneNode(true));
    document.getElementsByClassName('app')[0].appendChild(confuseEl);
    document.getElementsByClassName('app')[0].appendChild(padding.cloneNode(true));
    document.getElementsByClassName('app')[0].appendChild(stickyEl);
    document.getElementsByClassName('app')[0].appendChild(padding.cloneNode(true));
    document.getElementsByClassName('app')[0].appendChild(targetEl);
    document.getElementsByClassName('app')[0].appendChild(padding.cloneNode(true));
    document.getElementsByClassName('app')[0].appendChild(frameEl);
}, 2000);

var running = setInterval( function tick() {
    try
    {
        var all = document.getElementsByClassName('fragment'); //Build a list of chat message elements and add to "pointer" (hashmap)
        for (var i = 0; i < all.length; i++)
        {
            if (all[i].attributes[0].value == 'fragment')
            {
                messages.all = all[i].getElementsByClassName('messageHistory')[0].children;
            }
        }

        for (var x = 0; x < messages.all.length; x++)
        {
            //Append message IDs to each message
            var content = messages.all[x].getElementsByClassName('content')[0];
            if (content.children[content.children.length-1].innerHTML.split(' ')[0] != "msgId")
            {
                var idLabel = document.createElement('p');
                idLabel.setAttribute("class", "smaller");
                idLabel.style.color = "#B0C5D1";
                idLabel.innerHTML = "msgId = " + getId(messages.all[x]);
                content.appendChild(idLabel);
            }

            if (frame)
            {
                if (getAuthor(getId(messages.all[x])) == victim && frameList.indexOf(getId(messages.all[x])) == -1)
                {
                    frameList.push(messages.all[x]);
                }
            }

            if (confuse)
            {
                if ((messages.all[x].attributes[2].value.includes("participant") | messages.all[x].attributes[2].value.includes("live-session")) && othersList.indexOf(getId(messages.all[x])) == -1)
                    othersList.push(messages.all[x]);
            }
        }
        newMsgId = getId(messages.all[messages.all.length-1]);
    }
    catch (err) {}

    if (oldMsgId != newMsgId)
    {
        if (isMe(newMsgId) || (freemode && exclusionList.indexOf(getAuthor()) == -1))
        {
            var latestMsg = getMsg(newMsgId);
            var splitMsg = latestMsg.split('&nbsp;').join(' ').split(/ +/); //handles stupid pasting shit

            if (isMe(newMsgId) && latestMsg == "!freemode")
            {
                freemode = !freemode;
                if (freemode) { freemEl.style.color = "limegreen"; } else { freemEl.style.color = "red"; }
            }

            if (isMe(newMsgId) && latestMsg == "!chaos")
            {
                chaosmode = !chaosmode;
                if (chaosmode) { chaosmEl.style.color = "limegreen"; } else { chaosmEl.style.color = "red"; }
            }

            if (latestMsg == "!confuse")
            {
                confuse = !confuse;
                if (confuse) { confuseEl.style.color = "limegreen"; } else { confuseEl.style.color = "red"; }
            }

            if (splitMsg[0] == "!target")
            {
                target = !target;

                if (target)
                {
                    targetName = splitMsg[1].replace('`', ' ');
                    targetMsgId = splitMsg[2];
                    targetEl.innerHTML = 'Targetting: "' + targetName + '" with "' + getMsg(targetMsgId) + '"';
                    targetEl.style.color = "Violet";
                }
                else
                {
                    targetEl.innerHTML = 'Sticky: None';
                    targetEl.style.color = "#B0C5D1";
                }
            }

            if (splitMsg[0] == "!sticky")
            {
                sticky = !sticky;

                if (sticky)
                {
                    if (splitMsg.length > 1)
                    {
                        stickyMsgId = splitMsg[1];
                    }
                    else
                    {
                        stickyMsgId = getId(messages.all[messages.all.length-2]);
                    }

                    stickyEl.innerHTML = 'Sticky: "' + getMsg(stickyMsgId) + '"';
                    stickyEl.style.color = "DarkViolet";
                }
                else
                {
                    stickyEl.innerHTML = 'Sticky: None';
                    stickyEl.style.color = "#B0C5D1";
                }
            }

            if (splitMsg[0] == "!grab")
            {
                sendMsg(splitMsg[1]);
            }

            if (splitMsg[0] == "!setSpeed")
            {
                messages.all[messages.all.length-1].parentNode.removeChild(messages.all[messages.all.length-1]);
                tickSpeed = splitMsg[1].replace("ms", "");
                speedEl.innerHTML = "Tick Speed: " + tickSpeed + "ms";
                clearInterval(running);
                running = setInterval(tick, tickSpeed);
            }

            if (splitMsg[0] == "!setUrl")
            {
                defaultUrl = urlList[splitMsg[1]];
                urlEl.innerHTML = "Current Url:  " + getKey(defaultUrl);
            }

            if (splitMsg[0] == "!setToken")
            {
                regToken = splitMsg[1];
            }

            if (splitMsg[0] == "!frame" && isMe(newMsgId))
            {
                frame = !frame;

                if (frame)
                {
                    victim = splitMsg[1].replace('`', ' ');
                    frameEl.innerHTML = 'Victim: "' + victim + '"';
                    frameEl.style.color = "Violet";
                    frameList = [];
                }
                else
                {
                    frameEl.innerHTML = 'Victim: None';
                    frameEl.style.color = "#B0C5D1";
                }
            }

            if (latestMsg == "!getUrl")
            {
                alert(defaultUrl);
            }

            if (latestMsg == "!getUrlList")
            {
                alert(Object.keys(urlList));
            }

            if (latestMsg[0] == '!')
            {
                //Deletes commands to prevent accidental activations
                messages.all[messages.all.length-1].parentNode.removeChild(messages.all[messages.all.length-1]);
            }
        }

        //Will only post when there is a change
        if (sticky)
        {
            sendMsg(stickyMsgId);
        }

        if (target)
        {
            if (getAuthor(newMsgId) == targetName)
            {
                sendMsg(targetMsgId);
            }
        }
    }

    //Will post every interval
    if (chaosmode)
    {
        if (messages.all.length > 0)
        {
            var randMsg = messages.all[Math.floor((Math.random() * messages.all.length-1))];
            if (getMsg(getId(randMsg))[0] != '!')
            {
                sendMsg(getId(randMsg));
                console.log(getMsg(getId(randMsg)));
            }
        }
    }

    if (frame)
    {
        if (frameList.length > 0)
        {
            var randFMsg = frameList[Math.floor((Math.random() * frameList.length-1))];
            if (getMsg(getId(randFMsg))[0] != '!')
            {
                sendMsg(getId(randFMsg));
                console.log(getMsg(getId(randFMsg)));
            }
        }
    }

    if (confuse)
    {
        if (othersList.length > 0)
        {
            var randOMsg = othersList[Math.floor((Math.random() * othersList.length-1))];
            sendMsg(getId(randOMsg));
            console.log(getMsg(getId(randOMsg)));
        }
    }

    oldMsgId = newMsgId;
}, tickSpeed);

function getId(element) //Pass in an element within messageHistory
{
    return element.attributes[6].value; //return data-id attribute
}

function getBubble(id)
{
    var possibles = $('[' + 'data-id=' + id + ']');
    if (possibles.length > 0)
    {
        return possibles[0].getElementsByClassName('bubble')[0];
    }
    return "Invalid";
}

function getMsg(id)
{
    try
    {
        return getBubble(id).getElementsByTagName('p')[0].innerHTML;
    }
    catch (err) { return "Invalid"; }
}

function getAuthor(id)
{
    try
    {
        return getBubble(id).getElementsByClassName('tileName')[0].children[0].innerHTML;
    }
    catch (err) { if (isMe(id)) { return "Me"; } else { return "other"; } }
}

function isMe(id)
{
    try
    {
        return getBubble(id).parentNode.attributes[3].value.includes(' me ');
    }
    catch (err) { return "Invalid"; }
}

function sendMsg(id)
{
    xhttp.open("POST", defaultUrl, true);
    xhttp.setRequestHeader("RegistrationToken", regToken);
    xhttp.send(JSON.stringify({"content":"","messagetype":"RichText","contenttype":"text","clientmessageid":id}));
}

function getKey(value)
{
    for(var x in urlList)
    {
        if (urlList[x] == value)
        {
            return x;
        }
    }
    return "Invalid key";
}
