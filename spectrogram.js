var canvas = document.getElementById('spectrogram');

var gl;
var shaderProgram;

var vertexPositionAttribute;
var textureCoordAttribute;

var samplerUniform;
var zoomUniform;

var vertexPositionBuffers;
var textureCoordBuffer;

var spectrogramTextures;

var dirty = false;
var zoom = 1.0;
var pan_x = 0.0;
var pan_y = 0.0;

function start() {
    gl = initWebGL(canvas);

    window.addEventListener("resize", resizeCanvas, false);
    resizeCanvas();
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.disable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT);
    logInfo();
    initShaders();
    loadSpectrogram(new Float32Array(256), 16, 16);
    setInterval(drawScene, 15);
}

function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    dirty = true;
}

function logInfo() {
    console.log('Version:', gl.getParameter(gl.VERSION));
    console.log('ShadingLanguageVersion:', gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
    console.log('Vendor:', gl.getParameter(gl.VENDOR));
    console.log('Renderer:', gl.getParameter(gl.RENDERER));
    console.log('MaxTextureSize:', gl.getParameter(gl.MAX_TEXTURE_SIZE));
}

function initWebGL(canvas) {
    gl = null;
    try {
        gl = canvas.getContext('webgl');
    } catch (e) {
        alert('Could not initialize WebGL');
        gl = null;
    }
    gl.getExtension("OES_texture_float");
    var error = gl.getError();
    if (error != gl.NO_ERROR) {
        alert("Could not enable float texture extension because");
    }
    gl.getExtension("OES_texture_float_linear");
    if (error != gl.NO_ERROR) {
        alert("Could not enable float texture linear extension because");
    }
    return gl;
}

function initShaders() {
    var fragmentShader = getShader(gl, 'fragmentShader');
    var vertexShader = getShader(gl, 'vertexShader');

    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert("unable to initialize shader program.");
    }

    gl.useProgram(shaderProgram);

    vertexPositionAttribute = gl.getAttribLocation(shaderProgram, 'aVertexPosition');
    gl.enableVertexAttribArray(vertexPositionAttribute);

    textureCoordAttribute = gl.getAttribLocation(shaderProgram, 'aTextureCoord');
    gl.enableVertexAttribArray(textureCoordAttribute);

    samplerUniform = gl.getUniformLocation(shaderProgram, 'uSampler');
    zoomUniform = gl.getUniformLocation(shaderProgram, 'mZoom');
}

function getShader(gl, id) {
    var shaderScript, theSource, currentChild, shader;

    shaderScript = document.getElementById(id);

    if (!shaderScript) {
        return null;
    }

    theSource = "";
    currentChild = shaderScript.firstChild;

    while (currentChild) {
        if (currentChild.nodeType == currentChild.TEXT_NODE) {
            theSource += currentChild.textContent;
        }
        currentChild = currentChild.nextSibling;
    }

    if (shaderScript.type == "x-shader/x-fragment") {
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if  (shaderScript.type == "x-shader/x-vertex") {
        shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
        return null;
    }

    gl.shaderSource(shader, theSource);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
        return null;
    }

    return shader;
}

function loadSpectrogram(spectrogram, nblocks, nfreqs) {
    for (var i in spectrogramTextures) {
        gl.deleteBuffer(vertexPositionBuffers[i]);
        gl.deleteTexture(spectrogramTextures[i]);
    }
    gl.deleteBuffer(textureCoordBuffer);

    var max_width = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    var num_textures = Math.ceil(nblocks / max_width);
    var max_x_coord = nblocks / max_width;
    if (max_x_coord < 1) { max_x_coord = 1; }
    vertexPositionBuffers = new Array(num_textures);
    spectrogramTextures = new Array(num_textures);

    console.log("Cutting up spectrogram in "+num_textures+" textures.");

    textureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    var textureCoordinates = [
        1.0, 1.0,
        0.0, 1.0,
        1.0, 0.0,
        0.0, 0.0
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);

    for (var i=0; i<num_textures; i++) {
        var min_x = i/max_x_coord;
        var max_x = (i < num_textures-1) ? (i+1)/max_x_coord : 1;

        vertexPositionBuffers[i] = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffers[i]);
        var vertices = [
            max_x * 2 - 1,  1.0,
            max_x * 2 - 1, -1.0,
            min_x * 2 - 1,  1.0,
            min_x * 2 - 1, -1.0
        ];
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

        var blocks = (i < num_textures-1) ? max_width : nblocks-(i*max_width);
        var data = spectrogram.subarray(i*max_width*nfreqs);
        spectrogramTextures[i] = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, spectrogramTextures[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, nfreqs, blocks, 0, gl.LUMINANCE, gl.FLOAT, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    dirty = true;
}

function drawScene() {
    if (document.hidden || !dirty) {
        return
    }

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    gl.vertexAttribPointer(textureCoordAttribute, 2, gl.FLOAT, false, 0, 0);

    var zoomMatrix = [
        zoom, 0.0,  pan_x,
        0.0,  zoom, -pan_y,
        0.0,  0.0,  1.0
    ];
    gl.uniformMatrix3fv(zoomUniform, gl.FALSE, zoomMatrix);

    for (var i=0; i<spectrogramTextures.length; i++) {
        gl.activeTexture(gl.TEXTURE0+i);
        gl.bindTexture(gl.TEXTURE_2D, spectrogramTextures[i]);
        gl.uniform1i(samplerUniform, i);

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffers[i]);
        gl.vertexAttribPointer(vertexPositionAttribute, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    dirty = false;
}

var zoom = 1.0;

canvas.onwheel = function(wheel) {
    if (wheel.shiftKey) {
        zoom *= Math.pow(0.99, wheel.deltaY);
        zoom = Math.max(1.0, zoom);
        dirty = true;
    } else {
        pan_y += 0.001 * wheel.deltaY;
        pan_x += 0.001 * wheel.deltaX;
        dirty = true;
    }
}

canvas.onclick = function() {
    console.log("click")
}
