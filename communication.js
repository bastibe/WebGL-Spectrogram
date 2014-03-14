var ws = new WebSocket("ws://localhost:8888/spectrogram");
ws.binaryType = 'arraybuffer';

function send_message(type, content, payload) {
    /* Send a message.

       Arguments:
       msg_type  the message type as string.
       content   the message content as json-serializable data.
       payload   binary data as ArrayBuffer.
    */

    if (payload === null) {
        ws.send(JSON.stringify({
            type: type,
            content: content
        }));
    } else {
        var header_string = JSON.stringify({
            type: type,
            content: content
        });
        // append enough spaces so that the payload starts at an 8-byte
        // aligned position. The first four bytes will be the length of
        // the header, encoded as a 32 bit signed integer:
        var alignment_bytes = 8-((header_string.length+4)%8);
        for (var i=0; i<alignment_bytes; i++) {
            header_string += " ";
        }

        var message = new ArrayBuffer(4 + header_string.length + payload.byteLength);

        // write the length of the header as a binary 32 bit signed integer:
        var prefix_data = new Int32Array(message, 0, 4);
        prefix_data[0] = header_string.length;

        // write the header data
        var header_data = new Uint8Array(message, 4, header_string.length)
        for (var i=0; i<header_string.length; i++) {
            header_data[i] = header_string.charCodeAt(i);
        }

        // write the payload data
        payload_data = new Uint8Array(message, 4+header_string.length, payload.byteLength);
        payload_data.set(new Uint8Array(payload));
        ws.send(message);
    }
}

function request_file_spectrogram(filename, nfft, overlap) {
    /* Request the spectrogram for a file.

       Arguments:
       filename  the file name from which to load audio data.
       nfft      the FFT length used for calculating the spectrogram.
       overlap   the amount of overlap between consecutive spectra.
    */

    send_message("request_file_spectrogram", {
        filename: filename,
        nfft: nfft,
        overlap: overlap
    });
}

function request_data_spectrogram(data, nfft, overlap) {
    /* Request the spectrogram for a file.

       Arguments:
       data      the content of a file from which to load audio data.
       nfft      the FFT length used for calculating the spectrogram.
       overlap   the amount of overlap between consecutive spectra.
    */

    send_message("request_data_spectrogram", {
        nfft: nfft,
        overlap: overlap
    }, data);
}

ws.onmessage = function(event) {
    /* Parses a message

       Each message must contain the message type, the message
       content, and an optional binary payload. The decoded message
       will be forwarded to different functions based on the message
       type.

       Arguments:
       event     the message, either as string or ArrayBuffer.
    */

    if (event.data.constructor.name === "ArrayBuffer") {
        var header_len = new Int32Array(event.data, 0, 1)[0];
        var header = String.fromCharCode.apply(null, new Uint8Array(event.data, 4, header_len));
    } else {
        var header = event.data;
    }

    try {
        msg = JSON.parse(header);
    } catch(e) {
        console.error("Message", e.message, "is not a valid JSON object");
        return
    }

    var type = msg.type
    var content = msg.content

    if (type === "spectrogram") {
        loadSpectrogram(new Float32Array(event.data, header_len+4),
                        content.extent[0], content.extent[1],
                        content.fs, content.length);
    }
    else if (type === "loading_progress") {
        updateProgressBar(content.progress);
    } else {
        console.log(type, content);
    }
}

function updateProgressBar(progress) {
    /* Sets the progress bar

       If progress is 0 or 1, the progress bar will be turned
       invisible.
    */

    var progressBar = document.getElementById('progressBar');
    if (progress === 0 || progress === 1) {
        progressBar.hidden = true;
    } else {
        progressBar.hidden = false;
        progressBar.value = progress;
    }
}

ws.onopen = reloadSpectrogram;
function reloadSpectrogram() {
    /* Loads the spectrogram for the currently seleced file/FFT-length.

       Reads the audioFile input field to get the current file and the
       select field to get the current FFT length.

       This only sends the request for a spectrogram. Delivering the
       spectrogram is up to the server.
    */

    var audioFile = document.getElementById('audioFile').files[0];
    if (!audioFile) {
        console.log("Could not load spectrogram: No file selected");
        return;
    }
    var reader = new FileReader();
    reader.readAsArrayBuffer(audioFile);
    reader.onloadend = function () {
        var fftLen = parseFloat(document.getElementById('fftLen').value);
        request_data_spectrogram(reader.result, fftLen)
    }
}
