/*
 Copyright 2014 Google Inc. All Rights Reserved.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

function RequestQueue(){
  this.pending = [];
  this.sending = false;
}

RequestQueue.prototype.add = function( request, callback){
  this.pending.push([request, callback, null]);
  this.send();
}

RequestQueue.prototype.send = function(){
  console.log("RequestQueue Send");
  if (!this.sending && (this.pending.length > 0)){
    this.sending = true;
    console.log("RequestQueue Sending");
    this.ws = newWebsocket();
    var self = this;
    function newWebsocket(){
      ws = new WebSocket("ws://127.0.0.1:5678/socket?host=127.0.0.1:80")
      ws.onopen = function(event){
        console.log("Opened from SW");
        ws.send(self.pending[0][0]);
      }

      ws.onerror = function(event){
        console.log("SW error")
      }

      ws.onclose = function(event){
        console.log("SW close");
        self.sending = false;
        if (self.pending[0][2] === null){
          console.log("WHat??")
        }else{
          self.pending[0][2].controller.close();
          console.log("Closing controller");
          self.pending.shift();
        }
        self.send();
      }

      ws.onmessage = function(event){
        
        console.log("Calling event")
        var pop = self.pending[0][1](event, self.pending[0][2]);
        if (pop === null){
          self.pending.shift();
        }else{
          self.pending[0][2] = pop;
        }
      }
      return ws;
    }
  }
}
var requestQueue = new RequestQueue();

var currentPromise = null;
var initDone = false;
self.addEventListener("message", function(event){
  initDone = event.data.open;
})

self.addEventListener('fetch', function(event) {
  console.log('Handling fetch event for', event.request.url);
  var requestUrl = new URL(event.request.url);
  if (!initDone){
    return;
  }
  
  var currentPromise = new Promise(function(resolve, reject){
    var requestUrl = event.request.url;
    event.request.arrayBuffer().then(function(result){
      var headerStr = event.request.method + " " + event.request.url + " HTTP/1.0\r\n";
      event.request.headers.forEach(function(key, value){
        headerStr += value + ": " + key + '\r\n';
      });
      headerStr += '\r\n'
      var headerArray = strToUTF8Arr(headerStr);
      var reqArray  = concatTypedArrays(headerArray, new Uint8Array(result));
      var encoded = base64EncArr(reqArray);
      requestQueue.add(encoded, function(event,streamControllerWrapper){
        var array = base64DecToArr(event.data);
        var rawreq = UTF8ArrToStr(array);
        var last = false
        /*if (rawreq[0].charCodeAt(0) == 1){
          last = true
        }
        rawreq = rawreq.substr(1)*/
        if (!streamControllerWrapper){
          streamControllerWrapper = {};
          var split = rawreq.split('\r\n\r\n',2)
          var headersSplit = split[0];
          var body = (new Uint8Array(array)).subarray(split[0].length+4);
          console.log("Response headers for +" + requestUrl +"\n" + headersSplit)
          var headers = {};
          var headerList = headersSplit.split('\r\n')
          var statusRow = headerList[0].split(" ");
          var bodySize = 0;
          headerList.slice(1).forEach((value)=>{
            var resplit = value.split(":", 2);
            console.log("'" + resplit[0] + "' == '" + resplit[1].trim() + "'");
            if (resplit[0] == "Content-Length"){
              console.log("Got content length");
              bodySize = parseInt(resplit[1].trim());
              console.log("BSize " + bodySize);
              
            }
            headers[resplit[0]] = resplit[1].trim();
          })

          //TODO check if Content-Length is set
          var responseInit = {
            // status/statusText default to 200/OK, but we're explicitly setting them here.
            status: statusRow[1],
            statusText: statusRow[2],
            headers: headers
          };
          
          streamControllerWrapper.received = body.length;

          var bodyStream = function(streamControllerWrapper){return new ReadableStream({
            start(controller){
              streamControllerWrapper.controller = controller;
              console.log("Stream start " + body.length);
              controller.enqueue(body);
              console.log(" have " + streamControllerWrapper.received);
            },
            pull(controller){console.log("Pull")},
            cancel(){console.log("Stream ended")}
          })}(streamControllerWrapper);

          var mockResponse = new Response(bodyStream, responseInit);

          //pendingEvent.respondWith(mockResponse);
          resolve(mockResponse);
        }else{
          streamControllerWrapper.controller.enqueue(array);
          streamControllerWrapper.received += array.length;
        }
        console.log(" got " + streamControllerWrapper.received);
        if (!last){
          console.log(" got only " + streamControllerWrapper.received);
          return streamControllerWrapper;
        }
        //streamControllerWrapper.controller.close();
        //console.log("controller close");
        //return null;
      });
    })
  });
  console.log(currentPromise);
  event.respondWith(currentPromise);
  //return currentPromise;
});



function concatTypedArrays(a, b) { // a, b TypedArray of same type
  var c = new (a.constructor)(a.length + b.length);
  c.set(a, 0);
  c.set(b, a.length);
  return c;
}
/*\
|*|
|*|  utilitairezs de manipulations de chaînes base 64 / binaires / UTF-8
|*|
|*|  https://developer.mozilla.org/fr/docs/Décoder_encoder_en_base64
|*|
\*/

/* Décoder un tableau d'octets depuis une chaîne en base64 */

function b64ToUint6 (nChr) {

  return nChr > 64 && nChr < 91 ?
      nChr - 65
    : nChr > 96 && nChr < 123 ?
      nChr - 71
    : nChr > 47 && nChr < 58 ?
      nChr + 4
    : nChr === 43 ?
      62
    : nChr === 47 ?
      63
    :
      0;

}

function base64DecToArr (sBase64, nBlocksSize) {

  var
    sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, ""), nInLen = sB64Enc.length,
    nOutLen = nBlocksSize ? Math.ceil((nInLen * 3 + 1 >> 2) / nBlocksSize) * nBlocksSize : nInLen * 3 + 1 >> 2, taBytes = new Uint8Array(nOutLen);

  for (var nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
    nMod4 = nInIdx & 3;
    nUint24 |= b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 18 - 6 * nMod4;
    if (nMod4 === 3 || nInLen - nInIdx === 1) {
      for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
        taBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
      }
      nUint24 = 0;

    }
  }

  return taBytes;
}

/* encodage d'un tableau en une chaîne en base64 */

function uint6ToB64 (nUint6) {

  return nUint6 < 26 ?
      nUint6 + 65
    : nUint6 < 52 ?
      nUint6 + 71
    : nUint6 < 62 ?
      nUint6 - 4
    : nUint6 === 62 ?
      43
    : nUint6 === 63 ?
      47
    :
      65;

}

function base64EncArr (aBytes) {

  var nMod3 = 2, sB64Enc = "";

  for (var nLen = aBytes.length, nUint24 = 0, nIdx = 0; nIdx < nLen; nIdx++) {
    nMod3 = nIdx % 3;
    if (nIdx > 0 && (nIdx * 4 / 3) % 76 === 0) { sB64Enc += "\r\n"; }
    nUint24 |= aBytes[nIdx] << (16 >>> nMod3 & 24);
    if (nMod3 === 2 || aBytes.length - nIdx === 1) {
      sB64Enc += String.fromCharCode(uint6ToB64(nUint24 >>> 18 & 63), uint6ToB64(nUint24 >>> 12 & 63), uint6ToB64(nUint24 >>> 6 & 63), uint6ToB64(nUint24 & 63));
      nUint24 = 0;
    }
  }

  return sB64Enc.substr(0, sB64Enc.length - 2 + nMod3) + (nMod3 === 2 ? '' : nMod3 === 1 ? '=' : '==');

}

/* Tableau UTF-8 en DOMString et vice versa */

function UTF8ArrToStr (aBytes) {

  var sView = "";

  for (var nPart, nLen = aBytes.length, nIdx = 0; nIdx < nLen; nIdx++) {
    nPart = aBytes[nIdx];
    sView += String.fromCharCode(
      nPart > 251 && nPart < 254 && nIdx + 5 < nLen ? /* six bytes */
        /* (nPart - 252 << 32) n'est pas possible pour ECMAScript donc, on utilise un contournement... : */
        (nPart - 252) * 1073741824 + (aBytes[++nIdx] - 128 << 24) + (aBytes[++nIdx] - 128 << 18) + (aBytes[++nIdx] - 128 << 12) + (aBytes[++nIdx] - 128 << 6) + aBytes[++nIdx] - 128
      : nPart > 247 && nPart < 252 && nIdx + 4 < nLen ? /* five bytes */
        (nPart - 248 << 24) + (aBytes[++nIdx] - 128 << 18) + (aBytes[++nIdx] - 128 << 12) + (aBytes[++nIdx] - 128 << 6) + aBytes[++nIdx] - 128
      : nPart > 239 && nPart < 248 && nIdx + 3 < nLen ? /* four bytes */
        (nPart - 240 << 18) + (aBytes[++nIdx] - 128 << 12) + (aBytes[++nIdx] - 128 << 6) + aBytes[++nIdx] - 128
      : nPart > 223 && nPart < 240 && nIdx + 2 < nLen ? /* three bytes */
        (nPart - 224 << 12) + (aBytes[++nIdx] - 128 << 6) + aBytes[++nIdx] - 128
      : nPart > 191 && nPart < 224 && nIdx + 1 < nLen ? /* two bytes */
        (nPart - 192 << 6) + aBytes[++nIdx] - 128
      : /* nPart < 127 ? */ /* one byte */
        nPart
    );
  }

  return sView;

}

function strToUTF8Arr (sDOMStr) {

  var aBytes, nChr, nStrLen = sDOMStr.length, nArrLen = 0;

  /* mapping... */

  for (var nMapIdx = 0; nMapIdx < nStrLen; nMapIdx++) {
    nChr = sDOMStr.charCodeAt(nMapIdx);
    nArrLen += nChr < 0x80 ? 1 : nChr < 0x800 ? 2 : nChr < 0x10000 ? 3 : nChr < 0x200000 ? 4 : nChr < 0x4000000 ? 5 : 6;
  }

  aBytes = new Uint8Array(nArrLen);

  /* transcription... */

  for (var nIdx = 0, nChrIdx = 0; nIdx < nArrLen; nChrIdx++) {
    nChr = sDOMStr.charCodeAt(nChrIdx);
    if (nChr < 128) {
      /* one byte */
      aBytes[nIdx++] = nChr;
    } else if (nChr < 0x800) {
      /* two bytes */
      aBytes[nIdx++] = 192 + (nChr >>> 6);
      aBytes[nIdx++] = 128 + (nChr & 63);
    } else if (nChr < 0x10000) {
      /* three bytes */
      aBytes[nIdx++] = 224 + (nChr >>> 12);
      aBytes[nIdx++] = 128 + (nChr >>> 6 & 63);
      aBytes[nIdx++] = 128 + (nChr & 63);
    } else if (nChr < 0x200000) {
      /* four bytes */
      aBytes[nIdx++] = 240 + (nChr >>> 18);
      aBytes[nIdx++] = 128 + (nChr >>> 12 & 63);
      aBytes[nIdx++] = 128 + (nChr >>> 6 & 63);
      aBytes[nIdx++] = 128 + (nChr & 63);
    } else if (nChr < 0x4000000) {
      /* five bytes */
      aBytes[nIdx++] = 248 + (nChr >>> 24);
      aBytes[nIdx++] = 128 + (nChr >>> 18 & 63);
      aBytes[nIdx++] = 128 + (nChr >>> 12 & 63);
      aBytes[nIdx++] = 128 + (nChr >>> 6 & 63);
      aBytes[nIdx++] = 128 + (nChr & 63);
    } else /* if (nChr <= 0x7fffffff) */ {
      /* six bytes */
      aBytes[nIdx++] = 252 + /* (nChr >>> 32) is not possible in ECMAScript! So...: */ (nChr / 1073741824);
      aBytes[nIdx++] = 128 + (nChr >>> 24 & 63);
      aBytes[nIdx++] = 128 + (nChr >>> 18 & 63);
      aBytes[nIdx++] = 128 + (nChr >>> 12 & 63);
      aBytes[nIdx++] = 128 + (nChr >>> 6 & 63);
      aBytes[nIdx++] = 128 + (nChr & 63);
    }
  }

  return aBytes;

}