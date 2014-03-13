var ws = new WebSocket("ws://localhost:8888/websocket");
ws.binaryType = 'arraybuffer';

ws.onopen = reloadSpectrogram;

var audioFile = document.getElementById('audioFile').files[0];
var fftLen = parseFloat(document.getElementById('fftLen').value);
var progressBar = document.getElementById('progressBar');

function send_msg(type, content) {
    ws.send(JSON.stringify({
        type: type,
        content: content
    }));
}

function send_binary_msg(type, content, payload) {
    var header = {
        type: type,
        content: content
    };

    var header_string = JSON.stringify(header);
    var alignment_bytes = 8-((header_string.length+4)%8);
    for (var i=0; i<alignment_bytes; i++) {
        header_string += " ";
    }

    var message = new ArrayBuffer(4 + header_string.length + payload.byteLength);

    var prefix_data = new Int32Array(message, 0, 4);
    prefix_data[0] = header_string.length;

    var header_data = new Uint8Array(message, 4, header_string.length)
    for (var i=0; i<header_string.length; i++) {
        header_data[i] = header_string.charCodeAt(i);
    }

    payload_data = new Uint8Array(message, 4+header_string.length, payload.byteLength);
    payload_data.set(new Uint8Array(payload));
    ws.send(message);
}


function request_file_spectrogram(filename, nfft, overlap) {
    send_msg("request_file_spectrogram", {
        filename: filename,
        nfft: nfft,
        overlap: overlap
    });
}

function request_data_spectrogram(data, nfft, overlap) {
    send_binary_msg("request_data_spectrogram", {
        nfft: nfft,
        overlap: overlap
    }, data);
}

function send_status(status) {
    send_msg("status", status);
}

ws.onmessage = function(event) {
    if (event.data.constructor.name === "ArrayBuffer") {
        var header_len = new Int32Array(event.data, 0, 1)[0];
        var header = String.fromCharCode.apply(null, new Uint8Array(event.data, 4, header_len));
        try {
            msg = JSON.parse(header)
        } catch(e) {
            console.error("Could not parse header of binary message:", e.message)
            return
        }
        if (msg.type === "spectrogram") {
            loadSpectrogram(new Float32Array(event.data, header_len+4),
                            msg.content.extent[0], msg.content.extent[1],
                            msg.content.fs, msg.content.length);
        }
    } else {
        try {
            msg = JSON.parse(event.data)
        } catch(e) {
            console.error("Could not parse message:", e.message)
            return
        }
        if (msg.type === "loading_progress") {
            if (msg.content.progress === 0 || msg.content.progress === 1) {
                progressBar.hidden = true;
            } else {
                progressBar.hidden = false;
                progressBar.value = msg.content.progress;
            }
        } else {
            console.log(msg.type, msg.content);
        }
    }
}

function reloadSpectrogram() {
    if (!audioFile) {
        console.log("Could not load spectrogram: No file selected");
        return;
    }
    var reader = new FileReader();
    reader.readAsArrayBuffer(audioFile);
    reader.onloadend = function () {
        request_data_spectrogram(reader.result, fftLen)
    }
}

function selectAudioFile(files) {
    audioFile = files[0];
    reloadSpectrogram();
}

function selectFFTLen(value) {
    fftLen = parseFloat(value);
    reloadSpectrogram();
}
