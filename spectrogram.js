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
    send_status("Hello, World!");
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
        var data = new Float32Array(event.data, header_len+4);
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

document.onclick = function(event) {
    request_spectrogram('thistle.wav')
};

scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
var renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
var geometry = new THREE.CubeGeometry(1,1,1);
var material = new THREE.MeshBasicMaterial({color: 0x00ff00});
var cube = new THREE.Mesh(geometry, material);
scene.add(cube);
camera.position.z = 5;
var render = function () {
    requestAnimationFrame(render);
    cube.rotation.x += 0.1;
    cube.rotation.y += 0.1;
    renderer.render(scene, camera);
};
render();
