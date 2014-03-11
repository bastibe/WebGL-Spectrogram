var canvas;
var gl;
var shaderProgram;

var vertexPositionAttribute;
var textureCoordAttribute;
var samplerUniform;

var vertexPositionBuffer;
var textureCoordBuffer;

var specTexture;

function start() {
    canvas = document.getElementById('spectrogram');
    gl = initWebGL(canvas);

    window.addEventListener("resize", resizeCanvas, false);
    resizeCanvas();
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.disable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT);
    logInfo();
    initShaders();
    initBuffers();
    initTextures();
    setInterval(drawScene, 15);
}

function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
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

var horizAspect = 580.0/640.0;

function initBuffers() {
    vertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);

    var vertices = [
         1.0,  1.0,  0.0,
         1.0, -1.0,  0.0,
        -1.0,  1.0,  0.0,
        -1.0, -1.0,  0.0
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    textureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);

    var textureCoordinates = [
        1.0, 1.0,
        0.0, 1.0,
        1.0, 0.0,
        0.0, 0.0
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
}

function initTextures() {
    specTexture = gl.createTexture();
    loadSpectrogram(new Float32Array(256), 16, 16);
}

function loadSpectrogram(spectrogram, nblocks, nfreqs) {
    gl.bindTexture(gl.TEXTURE_2D, specTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, nfreqs, nblocks, 0, gl.LUMINANCE, gl.FLOAT, spectrogram);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
}

function drawScene() {
    if (document.hidden) {
        return
    }

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0); // add integers for other samplers
    gl.bindTexture(gl.TEXTURE_2D, specTexture);
    gl.uniform1i(samplerUniform, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
    gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    gl.vertexAttribPointer(textureCoordAttribute, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
