var spectrogram = document.getElementById('spectrogram');
var specTimeScale = document.getElementById('specTimeScale');
var specFreqScale = document.getElementById('specFreqScale');
var specDataView = document.getElementById('specDataView');

var margin = 10;

var gl;
var shaderProgram;

var vertexPositionAttribute;
var textureCoordAttribute;

var samplerUniform;
var ampRangeUniform;
var zoomUniform;

var vertexPositionBuffers;
var textureCoordBuffer;

var spectrogramTextures;

var dirty = false;

var specSize;
var specViewSize;

function start() {
    gl = initWebGL(spectrogram);

    window.addEventListener("resize", resizeCanvas, false);
    resizeCanvas();
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.disable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT);
    logInfo();
    initShaders();
    loadSpectrogram(new Float32Array(256), 16, 16);
    setInterval(draw, 15);
}

function resizeCanvas() {
    spectrogram.width = spectrogram.clientWidth;
    spectrogram.height = spectrogram.clientHeight;
    gl.viewport(0, 0, spectrogram.width, spectrogram.height);
    specTimeScale.width = specTimeScale.clientWidth;
    specTimeScale.height = specTimeScale.clientHeight;
    specFreqScale.width = specFreqScale.clientWidth;
    specFreqScale.height = specFreqScale.clientHeight;
    dirty = true;
}

function logInfo() {
    console.log('Version:', gl.getParameter(gl.VERSION));
    console.log('ShadingLanguageVersion:', gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
    console.log('Vendor:', gl.getParameter(gl.VENDOR));
    console.log('Renderer:', gl.getParameter(gl.RENDERER));
    console.log('MaxTextureSize:', gl.getParameter(gl.MAX_TEXTURE_SIZE));
}

function initWebGL(spectrogram) {
    gl = null;
    try {
        gl = spectrogram.getContext('webgl');
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
    ampRangeUniform = gl.getUniformLocation(shaderProgram, 'vAmpRange');
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

function loadSpectrogram(spectrogram, nblocks, nfreqs, fs, length) {
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
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    specSize = new SpecSize(0, length, 0, fs/2);
    specViewSize = new SpecSize(0, length, 0, fs/2, -120, 0);
    dirty = true;
}

function draw() {
    if (document.hidden || !dirty) {
        return
    }
    drawSpectrogram();
    drawSpecTimeScale();
    drawSpecFreqScale();
    dirty = false;
}

function drawSpectrogram() {
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    gl.vertexAttribPointer(textureCoordAttribute, 2, gl.FLOAT, false, 0, 0);
    var panX = (specViewSize.centerT() - specSize.centerT()) / specSize.widthT();
    var panY = (specViewSize.centerF() - specSize.centerF()) / specSize.widthF();
    var zoomX = specSize.widthT() / specViewSize.widthT();
    var zoomY = specSize.widthF() / specViewSize.widthF();
    var zoomMatrix = [
        zoomX, 0.0,   -2*panX*zoomX,
        0.0,   zoomY, -2*panY*zoomY,
        0.0,   0.0,    1.0
    ];
    gl.uniformMatrix3fv(zoomUniform, gl.FALSE, zoomMatrix);

    gl.uniform2f(ampRangeUniform, specViewSize.minA, specViewSize.maxA);

    for (var i=0; i<spectrogramTextures.length; i++) {
        gl.activeTexture(gl.TEXTURE0+i);
        gl.bindTexture(gl.TEXTURE_2D, spectrogramTextures[i]);
        gl.uniform1i(samplerUniform, i);

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffers[i]);
        gl.vertexAttribPointer(vertexPositionAttribute, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}

function formatTime(seconds) {
    var minutes = Math.floor(seconds/60);
    var seconds = seconds % 60;
    minutes = minutes.toString();
    if (minutes.length === 1) {
        minutes = "0" + minutes;
    }
    seconds = seconds.toFixed(2);
    if (seconds.length === 4) {
        seconds = "0" + seconds;
    }
    return minutes + ":" + seconds;
}

function drawSpecTimeScale() {
    var ctx = specTimeScale.getContext('2d');
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // draw axis line and two ticks
    ctx.fillStyle = "black";
    ctx.fillRect(10, 2, ctx.canvas.width-20, 1);
    ctx.fillRect(10, 2, 1, 5);
    ctx.fillRect(ctx.canvas.width-10, 3, 1, 5);
    // draw lower time bound
    ctx.font = "8px sans-serif";
    var text = formatTime(specViewSize.minT);
    var textWidth = ctx.measureText(text).width;
    ctx.fillText(text, 0, ctx.canvas.height-2);
    // draw upper time bound
    var text = formatTime(specViewSize.maxT);
    var textWidth = ctx.measureText(text).width;
    ctx.fillText(text, ctx.canvas.width-textWidth, ctx.canvas.height-2);
}

function formatFreq(freq) {
    if (freq < 10) {
        return freq.toFixed(2) + " Hz";
    } else if (freq < 100) {
        return freq.toFixed(1) + " Hz";
    } else if (freq < 1000) {
        return Math.round(freq).toString() + " Hz";
    } else if (freq < 10000) {
        return (freq/1000).toFixed(2) + " kHz";
    } else {
        return (freq/1000).toFixed(1) + " kHz";
    }
}

function drawSpecFreqScale() {
    var ctx = specFreqScale.getContext('2d');
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // draw axis line and two ticks
    ctx.fillStyle = "black";
    ctx.fillRect(2, 10, 1, ctx.canvas.height-20);
    ctx.fillRect(2, 10, 5, 1);
    ctx.fillRect(2, ctx.canvas.height-10, 5, 1);
    // draw upper frequency bound
    ctx.font = "8px sans-serif";
    var text = formatFreq(specViewSize.maxF);
    var textWidth = ctx.measureText(text).width;
    ctx.fillText(text, 8, 14);
    // draw lower frequency bound
    var text = formatFreq(specViewSize.minF);
    var textWidth = ctx.measureText(text).width;
    ctx.fillText(text, 8, ctx.canvas.height-8);
}

spectrogram.onwheel = function(wheel) {
    var stepF = (specViewSize.maxF - specViewSize.minF)/100;
    var stepT = (specViewSize.maxT - specViewSize.minT)/100;
    if (wheel.altKey) {
        var center = (specViewSize.minA + specViewSize.maxA) / 2;
        var range  = (specViewSize.maxA - specViewSize.minA) / 2;
        range += wheel.deltaX/10;
        center += wheel.deltaY/10;
        specViewSize.minA = center-range;
        specViewSize.maxA = center+range;
    } else if (wheel.ctrlKey) {
        specViewSize.minF -= wheel.deltaY * stepF;
        specViewSize.maxF += wheel.deltaY * stepF;
        specViewSize.minT -= wheel.deltaY * stepT;
        specViewSize.maxT += wheel.deltaY * stepT;
    } else {
        specViewSize.minF += wheel.deltaY * stepF/10;
        specViewSize.maxF += wheel.deltaY * stepF/10;
        specViewSize.minT -= wheel.deltaX * stepT/10;
        specViewSize.maxT -= wheel.deltaX * stepT/10;
    }
    wheel.preventDefault();
    dirty = true;
    spectrogram.onmousemove(wheel);
}

spectrogram.onmousemove = function(mouse) {
    var t = specViewSize.scaleT(mouse.layerX/spectrogram.clientWidth);
    var f = specViewSize.scaleF(1-mouse.layerY/spectrogram.clientHeight);
    specDataView.innerHTML = formatTime(t) + ", " + formatFreq(f);
}

spectrogram.onclick = function() {
    console.log("click")
}
