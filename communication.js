var ws = new WebSocket("ws://localhost:8888/websocket");
ws.binaryType = 'arraybuffer';

function send_msg(type, content) {
    ws.send(JSON.stringify({
        "type": type,
        "content": content
    }));
}

function request_spectrogram(filename, nfft, overlap) {
    send_msg("request_spectrogram", {
        "filename": filename,
        "nfft": nfft,
        "overlap": overlap
    });
}

function send_status(status) {
    send_msg("status", status);
}

ws.onopen = function() {
    request_spectrogram('thistle.wav', 1024);
};

ws.onmessage = function(event) {
    if (event.data.constructor.name === "ArrayBuffer") {
        var header_len = new Int32Array(event.data, 0, 1)[0];
        var header = String.fromCharCode.apply(null, new Uint8Array(event.data, 4, header_len));
        try {
            header = JSON.parse(header)
        } catch(e) {
            console.error("Could not parse header of binary message:", e.message)
            return
        }
        if (header.type === "spectrogram") {
            spectrogram(header, new Float32Array(event.data, header_len+4));
        }
    } else {
        try {
            msg = JSON.parse(event.data)
        } catch(e) {
            console.error("Could not parse message:", e.message)
            return
        }
        console.log(msg.type, msg.content);
    }
};

function spectrogram(header, data) {
    loadSpectrogram(data, header.extent[0], header.extent[1]);
}
