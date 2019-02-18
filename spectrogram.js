var specView;
var specTimeScale;
var specFrequencyScale;
var specDataView;

var gl; // the WebGL instance

// shader attributes:
var vertexPositionAttribute;
var textureCoordAttribute;

// shader uniforms:
var samplerUniform;
var ampRangeUniform;
var zoomUniform;
var specSizeUniform;
var specDataSizeUniform;
var specModeUniform;
var specLogarithmicUniform;

// vertex buffer objects
var vertexPositionBuffers;
var textureCoordBuffer;

// textures objects
var spectrogramTextures;

var specSize; // total size of the spectrogram
var specViewSize; // visible size of the spectrogram

/* initialize all canvases */
function start() {
    specView = document.getElementById('spectrogram');
    specTimeScale = document.getElementById('specTimeScale');
    specFrequencyScale = document.getElementById('specFreqScale');
    specDataView = document.getElementById('specDataView');
    initSpectrogram();
    window.addEventListener("resize", updateCanvasResolutions, false);
    updateCanvasResolutions();
    eventsInit()
}

/* set resolution of all canvases to native resolution */
function updateCanvasResolutions() {
    specView.width = specView.clientWidth;
    specView.height = specView.clientHeight;
    gl.viewport(0, 0, specView.width, specView.height);
    specTimeScale.width = specTimeScale.clientWidth;
    specTimeScale.height = specTimeScale.clientHeight;
    specFrequencyScale.width = specFrequencyScale.clientWidth;
    specFrequencyScale.height = specFrequencyScale.clientHeight;
    window.requestAnimationFrame(drawScene);
}

/* log version and memory information about WebGL */
function logGLInfo() {
    sendMessage('information',
        "version: " + gl.getParameter(gl.VERSION) + "\n" +
        "shading language version: " + gl.getParameter(gl.SHADING_LANGUAGE_VERSION) + "\n" +
        "vendor: " + gl.getParameter(gl.VENDOR) + "\n" +
        "renderer: " + gl.getParameter(gl.RENDERER) + "\n" +
        "max texture size: " + gl.getParameter(gl.MAX_TEXTURE_SIZE) + "\n" +
        "max combined texture image units: " + gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS));
}

/* get WebGL context and load required extensions */
function initSpectrogram() {
    try {
        gl = specView.getContext('webgl');
    } catch (e) {
        alert('Could not initialize WebGL');
        gl = null;
    }
    // needed for floating point textures
    gl.getExtension("OES_texture_float");
    var error = gl.getError();
    if (error != gl.NO_ERROR) {
        alert("Could not enable float texture extension");
    }
    // needed for linear filtering of floating point textures
    gl.getExtension("OES_texture_float_linear");
    if (error != gl.NO_ERROR) {
        alert("Could not enable float texture linear extension");
    }
    // 2D-drawing only
    gl.disable(gl.DEPTH_TEST);

    // get shaders ready
    loadSpectrogramShaders();

    // load dummy data
    loadSpectrogram(new Float32Array(1), 1, 1, 44100, 1);
}

/* link shaders and save uniforms and attributes

   saves the following attributes to global scope:
   - vertexPositionAttribute: aVertexPosition
   - textureCoordAttribute: aTextureCoord

   saves the following uniforms to global scope:
   - samplerUniform: uSampler
   - zoomUniform: mZoom
   - ampRangeUniform: vAmpRange
   - specSizeUniform: vSpecSize
   - specModeUniform: uSpecMode
*/
function loadSpectrogramShaders() {
    //
    // creates a shader of the given type, uploads the source and
    // compiles it.
    //
    function loadShader(gl, type, source) {
      const shader = gl.createShader(type);

      // Send the source to the shader object

      gl.shaderSource(shader, source);

      // Compile the shader program

      gl.compileShader(shader);

      // See if it compiled successfully

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }

      return shader;
    }

    // Vertex shader program
    var vsSource = `
          attribute vec2 aVertexPosition;
          attribute vec2 aTextureCoord;
          uniform mat3 mZoom;
          varying highp vec2 vTextureCoord;
          void main() {
              vec3 zoomedVertexPosition = vec3(aVertexPosition, 1.0) * mZoom;
              gl_Position = vec4(zoomedVertexPosition, 1.0);
              vTextureCoord = aTextureCoord;
          }
    `;

    // Fragment shader program
    var fsSource =  `
          varying highp vec2 vTextureCoord;
          uniform sampler2D uSampler;
          uniform highp vec2 vAmpRange;
          uniform highp vec2 vSpecSize;
          uniform highp vec2 vDataSize;
          uniform int uSpecMode;
          uniform bool bSpecLogarithmic;
          highp vec3 physicalColor(highp float amplitude) {
            /*
              The physical color scaling is partitioning the full [0 ... 1] range into
              seven evenly spaced sub-ranges. That's what the modulo and floor are
              doing. Then, each range modifies only one color channel while keeping
              the other two constant. This is done in such a way that no two
              different values map to the same color.
              The ranges are:
              1. black (0,0,0) to red (1,0,0)
              2. red (1,0,0) to yellow (1,1,0)
              3. yellow (1,1,0) to green (0,1,0)
              4. green (0,1,0) to cyan (0,1,1)
              5. cyan (0,1,1) to blue (0,0,1)
              6. blue (0,0,1) to magenta (1,0,1)
              7. magenta (1,0,1) to white (1,1,1)
            */
              highp float fractional = mod(amplitude*8.0, 1.0);
              highp float integer = floor(amplitude*8.0);
              if (integer == 0.0) {
                  return vec3(fractional, 0.0, 0.0);
              } else if (integer == 1.0) {
                  return vec3(1.0, fractional, 0.0);
              } else if (integer == 2.0) {
                  return vec3(1.0-fractional, 1.0, 0.0);
              } else if (integer == 3.0) {
                  return vec3(0.0, 1.0, fractional);
              } else if (integer == 4.0) {
                  return vec3(0.0, 1.0-fractional, 1.0);
              } else if (integer == 5.0) {
                  return vec3(fractional, 0.0, 1.0);
              } else if (integer == 6.0) {
                  return vec3(1.0, 1.0-fractional, 1.0);
              } else {
                  return vec3(1.0, 1.0, 1.0);
              }
          }
          // from http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl
          highp vec3 rgb2hsv(highp vec3 c)
          {
              highp vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
              highp vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
              highp vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
              highp float d = q.x - min(q.w, q.y);
              highp float e = 1.0e-10;
              return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
          }
          // from http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl
          highp vec3 hsv2rgb(highp vec3 c)
          {
              highp vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
              highp vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
              return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
          }
          highp float logScale(highp float value) {
              value = 20.0*log(value)/log(10.0);
              //value = max(value, vAmpRange[0]);
              //value = min(value, vAmpRange[1]);
              value = (value - vAmpRange[0]) / (vAmpRange[1] - vAmpRange[0]);
              return value;
          }
          highp float getAmplitude(highp vec2 coord) {
              if (bSpecLogarithmic) {
                  coord.y = pow(vSpecSize.y, coord.y)/vSpecSize.y;
                  coord.y += 1.0/512.0;
              }
              return texture2D(uSampler, coord).r;
          }
          highp vec3 physicalMode() {
              highp float amplitude = getAmplitude(vTextureCoord);
              return physicalColor(logScale(amplitude));
          }
          highp vec3 normalMode() {
              highp float amplitude = getAmplitude(vTextureCoord);
              amplitude = logScale(amplitude);
              return vec3(amplitude, amplitude, amplitude);
          }
          highp vec3 direction() {
              highp vec2 d = vec2(0.0, 0.0);
              for (int x=0; x<=5; x++) {
                  for (int y=-5; y<=5; y+=1) {
                      highp vec2 vIter=vec2(x, y);
                      highp float amplitude = getAmplitude(vTextureCoord+vIter/vDataSize) *
                                              getAmplitude(vTextureCoord-vIter/vDataSize);
                      d += vIter * amplitude / ((x==0&&y==0) ? 1.0 : sqrt(float(x*x + y*y)));
                  }
              }
              highp float direction = atan(d.x, d.y)/3.14;
              highp float strength = sqrt(d.x*d.x + d.y*d.y);
              strength = logScale(strength*1000.0);
              return hsv2rgb(vec3((direction-0.5), abs((direction-0.5))*2.0, strength));
          }
          highp float amplitudeAt(highp float angle, highp float distance) {
              highp vec2 coord = vec2(cos(angle)*distance,
                                      sin(angle)*distance);
              highp float amplitude = getAmplitude(vTextureCoord+coord/vDataSize) *
                                      getAmplitude(vTextureCoord-coord/vDataSize);
              return amplitude;
          }
          highp float amplitudesAt(highp float angle) {
              highp float amplitude = 0.0;
              for (int i=1; i<=5; i++) {
                  amplitude += amplitudeAt(angle, float(i))/float(i*i);
              }
              return amplitude;
          }
          highp vec3 direction2() {
              highp vec2 histogram[16];
              histogram[0] = vec2(amplitudesAt(-3.14), -3.14);
              histogram[1] = vec2(amplitudesAt(-2.36), -2.36);
              histogram[2] = vec2(amplitudesAt(-1.57), -1.57);
              histogram[3] = vec2(amplitudesAt(-0.78), -0.78);
              histogram[4] = vec2(amplitudesAt( 0.0 ),  0.0 );
              histogram[5] = vec2(amplitudesAt( 0.78),  0.78);
              histogram[6] = vec2(amplitudesAt( 1.57),  1.57);
              histogram[7] = vec2(amplitudesAt( 2.36),  2.36);
              histogram[9] = vec2(amplitudesAt( 3.14),  3.14);
              highp vec2 max_value = vec2(0.0, 0.0);
              max_value = histogram[0].x > max_value.x ? histogram[0] : max_value;
              max_value = histogram[1].x > max_value.x ? histogram[1] : max_value;
              max_value = histogram[2].x > max_value.x ? histogram[2] : max_value;
              max_value = histogram[3].x > max_value.x ? histogram[3] : max_value;
              max_value = histogram[4].x > max_value.x ? histogram[4] : max_value;
              max_value = histogram[5].x > max_value.x ? histogram[5] : max_value;
              max_value = histogram[6].x > max_value.x ? histogram[6] : max_value;
              max_value = histogram[7].x > max_value.x ? histogram[7] : max_value;
              max_value = histogram[8].x > max_value.x ? histogram[8] : max_value;
              max_value = histogram[9].x > max_value.x ? histogram[9] : max_value;
              // scale to a third color rotation from green to red.
              highp float direction = max_value.y/3.14/3.0+0.333;
              highp float value = logScale(max_value.x);
              return hsv2rgb(vec3(direction, 1.0, value));
          }
          highp vec3 multiples() {
              highp float amplitude = getAmplitude(vTextureCoord);
              int iterations = 0;
              for (int m=2; m<=5; m++) {
                  highp float y = vTextureCoord.y*float(m);
                  if (y<1.0) {
                      amplitude *= getAmplitude(vec2(vTextureCoord.x, y));
                      iterations++;
                  }
              }
              amplitude = pow(amplitude, 1.0/float(iterations));
              amplitude = logScale(amplitude);
              return physicalColor(amplitude);
          }
          void main() {
              if (uSpecMode == 0) {
                  gl_FragColor = vec4(physicalMode(), 1.0);
              } else if (uSpecMode == 1) {
                  gl_FragColor = vec4(normalMode(), 1.0);
              } else if (uSpecMode == 2) {
                  gl_FragColor = vec4(direction2(), 1.0);
              } else if (uSpecMode == 3) {
                  gl_FragColor = vec4(multiples(), 1.0);
              }
          }
    `;

    var vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    var fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    var shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert("unable to link shader program.");
    }

    gl.useProgram(shaderProgram);

    vertexPositionAttribute = gl.getAttribLocation(shaderProgram, 'aVertexPosition');
    gl.enableVertexAttribArray(vertexPositionAttribute);

    textureCoordAttribute = gl.getAttribLocation(shaderProgram, 'aTextureCoord');
    gl.enableVertexAttribArray(textureCoordAttribute);

    samplerUniform = gl.getUniformLocation(shaderProgram, 'uSampler');
    zoomUniform = gl.getUniformLocation(shaderProgram, 'mZoom');
    ampRangeUniform = gl.getUniformLocation(shaderProgram, 'vAmpRange');
    specSizeUniform = gl.getUniformLocation(shaderProgram, 'vSpecSize');
    specDataSizeUniform = gl.getUniformLocation(shaderProgram, 'vDataSize');
    specModeUniform = gl.getUniformLocation(shaderProgram, 'uSpecMode');
    specLogarithmicUniform = gl.getUniformLocation(shaderProgram, 'bSpecLogarithmic');
}

/* load and compile a shader

   Attributes:
   id    the id of a script element that contains the shader source.

   Returns the compiled shader.
*/
function getShader(id) {
    var script = document.getElementById(id);

    if (script.type == "x-shader/x-fragment") {
        var shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (script.type == "x-shader/x-vertex") {
        var shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
        return null;
    }

    gl.shaderSource(shader, script.innerHTML);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
        return null;
    }

    return shader;
}

/* loads a spectrogram into video memory and fills VBOs

   If there is more data than fits into a single texture, several
   textures are allocated and the data is written into consecutive
   textures. According vertex positions are saved into an equal number
   of VBOs.

   - saves textures into a global array `spectrogramTextures`.
   - saves vertexes into a global array `vertexPositionBuffers`.
   - saves texture coordinates into global `textureCoordBuffer`.

   Attributes:
   data       a Float32Array containing nblocks x nfreqs values.
   nblocks    the width of the data, the number of blocks.
   nfreqs     the height of the data, the number of frequency bins.
   fs         the sample rate of the audio data.
   length     the length of the audio data in seconds.
   dB         an amplitude - {min,max}
*/
function loadSpectrogram(data, nblocks, nfreqs, fs, length, db = undefined) {
    // calculate the number of textures needed
    var maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    var numTextures = nblocks / maxTexSize;
    var currentDB;
    if (db)
    {
        currentDB = db;
    }
    else
    {
        currentDB = {'min':-120,'max':0}
    }

    // bail if too big for video memory
    if (Math.ceil(numTextures) > gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)) {
        alert("Not enough texture units to display spectrogram");
        return;
    }

    // delete previously allocated textures and VBOs
    for (var i in spectrogramTextures) {
        gl.deleteBuffer(vertexPositionBuffers[i]);
        gl.deleteTexture(spectrogramTextures[i]);
    }
    gl.deleteBuffer(textureCoordBuffer);


    vertexPositionBuffers = new Array(Math.ceil(numTextures));
    spectrogramTextures = new Array(Math.ceil(numTextures));

    // texture coordinates for all textures are identical
    textureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    var textureCoordinates = new Float32Array([
        1.0, 1.0,
        1.0, 0.0,
        0.0, 1.0,
        0.0, 0.0
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, textureCoordinates, gl.STATIC_DRAW);

    // for every texture, calculate vertex indices and texture content
    for (var i = 0; i < numTextures; i++) {
        // texture position in 0..1:
        var minX = i / numTextures;
        var maxX = ((i + 1) < numTextures) ? (i + 1) / numTextures : 1;

        // calculate vertex positions, scaled to -1..1
        vertexPositionBuffers[i] = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffers[i]);
        var vertices = new Float32Array([
            maxX * 2 - 1, 1.0,
            maxX * 2 - 1, -1.0,
            minX * 2 - 1, 1.0,
            minX * 2 - 1, -1.0
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        // fill textures with spectrogram data
        var blocks = ((i + 1) < numTextures) ? maxTexSize : (numTextures % 1) * maxTexSize;
        var chunk = data.subarray(i * maxTexSize * nfreqs, (i * maxTexSize + blocks) * nfreqs);
        var tmp = new Float32Array(chunk.length);
        for (var x = 0; x < blocks; x++) {
            for (var y = 0; y < nfreqs; y++) {
                tmp[x + blocks * y] = chunk[y + nfreqs * x];
            }
        }
        spectrogramTextures[i] = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, spectrogramTextures[i]);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, blocks, nfreqs, 0, gl.LUMINANCE, gl.FLOAT, tmp);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    }

    // save spectrogram sizes
    specSize = new SpecSize(0, length, 0, fs / 2);
    specSize.numT = nblocks;
    specSize.numF = nfreqs;
    specViewSize = new SpecSize(0, length, 0, fs / 2, currentDB['min'], currentDB['max']);

    window.requestAnimationFrame(drawScene);
}

/* updates the spectrogram and the scales */
function drawScene() {
    drawSpectrogram();
    drawSpecTimeScale();
    drawSpecFrequencyScale();
}

/* draw the zoomed spectrogram, one texture at a time */
function drawSpectrogram() {
    // load the texture coordinates VBO
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    gl.vertexAttribPointer(textureCoordAttribute, 2, gl.FLOAT, false, 0, 0);

    // set the current model view matrix
    var panX = (specViewSize.centerT() - specSize.centerT()) / specSize.widthT();
    var panY = (specViewSize.centerF() - specSize.centerF()) / specSize.widthF();
    var zoomX = specSize.widthT() / specViewSize.widthT();
    var zoomY = specSize.widthF() / specViewSize.widthF();
    var zoomMatrix = [
        zoomX, 0.0,   -2 * panX * zoomX,
        0.0,   zoomY, -2 * panY * zoomY,
        0.0,   0.0,   1.0
    ];
    gl.uniformMatrix3fv(zoomUniform, gl.FALSE, zoomMatrix);

    // set the current amplitude range to display
    gl.uniform2f(ampRangeUniform, specViewSize.minA, specViewSize.maxA);
    // set the size of the spectrogram
    gl.uniform2f(specSizeUniform, specSize.widthT(), specSize.widthF());
    gl.uniform2f(specDataSizeUniform, specSize.numT, specSize.numF);
    // set the spectrogram display mode
    var specMode = document.getElementById('specMode').value;
    gl.uniform1i(specModeUniform, specMode);
    var specLogarithmic = document.getElementById('specLogarithmic').checked;
    gl.uniform1i(specLogarithmicUniform, specLogarithmic);

    // switch interpolation on or off
    var interpolate = document.getElementById('specInterpolation').checked;

    // draw the spectrogram textures
    for (var i = 0; i < spectrogramTextures.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, interpolate ? gl.LINEAR : gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, interpolate ? gl.LINEAR : gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D, spectrogramTextures[i]);
        gl.uniform1i(samplerUniform, i);

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffers[i]);
        gl.vertexAttribPointer(vertexPositionAttribute, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}

/* format a time in mm:ss.ss

   Attributes:
   seconds    a time in seconds.

   returns    a formatted string containing minutes, seconds, and
     hundredths.
*/
function formatTime(seconds) {
    var minutes = Math.floor(seconds / 60);
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

/* draw the time scale canvas

   The time scale prints the minimum and maximum currently visible
   time and an axis with two ticks. Minimum and maximum time are taken
   from specViewSize.(min|max)T.
*/
function drawSpecTimeScale() {
    var ctx = specTimeScale.getContext('2d');
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // draw axis line and two ticks
    ctx.fillStyle = "black";
    ctx.fillRect(10, 2, ctx.canvas.width - 20, 1);
    ctx.fillRect(10, 2, 1, 5);
    ctx.fillRect(ctx.canvas.width - 10, 3, 1, 5);
    // draw lower time bound
    ctx.font = "8px sans-serif";
    var text = formatTime(specViewSize.minT);
    var textWidth = ctx.measureText(text).width;
    ctx.fillText(text, 0, ctx.canvas.height - 2);
    // draw upper time bound
    var text = formatTime(specViewSize.maxT);
    var textWidth = ctx.measureText(text).width;
    ctx.fillText(text, ctx.canvas.width - textWidth, ctx.canvas.height - 2);
}

/* convert a linear frequency coordinate to logarithmic frequency */
function freqLin2Log(f) {
    return Math.pow(specSize.widthF(), f / specSize.widthF());
}

/* format a frequency

   Attributes:
   frequency   a frequency in Hz.

   returns     a formatted string with the frequency in Hz or kHz,
     with an appropriate number of decimals. If logarithmic
     frequency is enabled, the returned frequency will be
     appropriately distorted.
*/
function formatFrequency(frequency) {
    frequency = document.getElementById('specLogarithmic').checked ? freqLin2Log(frequency) : frequency;

    if (frequency < 10) {
        return frequency.toFixed(2) + " Hz";
    } else if (frequency < 100) {
        return frequency.toFixed(1) + " Hz";
    } else if (frequency < 1000) {
        return Math.round(frequency).toString() + " Hz";
    } else if (frequency < 10000) {
        return (frequency / 1000).toFixed(2) + " KHz";
    } else if (frequency < 100000) {
        return (frequency / 1000).toFixed(1) + " KHz";
    } else if (frequency < 1000000) {
        return Math.round(frequency / 1000) + " KHz";
    } else if (frequency < 10000000) {
        return (frequency / 1000000).toFixed(2) + " MHz";
    } else if (frequency < 100000000) {
        return (frequency / 1000000).toFixed(1) + " MHz";
    } else {
        return Math.round(frequency / 1000000) + " MHz";
    }
}

/* draw the frequency scale canvas

   The frequency scale prints the minimum and maximum currently
   visible frequency and an axis with two ticks. Minimum and maximum
   frequency are taken from specViewSize.(min|max)F.
*/
function drawSpecFrequencyScale() {
    var ctx = specFrequencyScale.getContext('2d');
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // draw axis line and two ticks
    ctx.fillStyle = "black";
    ctx.fillRect(2, 10, 1, ctx.canvas.height - 20);
    ctx.fillRect(2, 10, 5, 1);
    ctx.fillRect(2, ctx.canvas.height - 10, 5, 1);
    // draw upper frequency bound
    ctx.font = "8px sans-serif";
    var text = formatFrequency(specViewSize.maxF);
    var textWidth = ctx.measureText(text).width;
    ctx.fillText(text, 8, 14);
    // draw lower frequency bound
    var text = formatFrequency(specViewSize.minF);
    var textWidth = ctx.measureText(text).width;
    ctx.fillText(text, 8, ctx.canvas.height - 8);
}

function eventsInit()
{
/* zoom or pan when on scrolling

   If no modifier is pressed, scrolling scrolls the spectrogram.

   If alt is pressed, scrolling changes the displayed amplitude range.
   Pressing shift as well switches X/Y scrolling.

   If ctrl is pressed, scrolling zooms in or out. If ctrl and shift is
   pressed, scrolling only zooms the time axis.

   At no time will any of this zoom or pan outside of the spectrogram
   view area.
*/
specView.onwheel = function(wheel) {
    var stepF = specViewSize.widthF() / 100;
    var stepT = specViewSize.widthT() / 100;
    if (wheel.altKey) {
        var center = specViewSize.centerA();
        var range = specViewSize.widthA();
        range += wheel.shiftKey ? wheel.deltaY / 10 : wheel.deltaX / 10;
        range = Math.max(range, 1);
        center += wheel.shiftKey ? wheel.deltaX / 10 : wheel.deltaY / 10;
        specViewSize.minA = center - range / 2;
        specViewSize.maxA = center + range / 2;
    } else if (wheel.ctrlKey) {
        var deltaT = wheel.deltaY * stepT;
        if (specViewSize.widthT() + 2 * deltaT > specSize.widthT()) {
            deltaT = (specSize.widthT() - specViewSize.widthT()) / 2;
        }
        var deltaF = wheel.shiftKey ? 0 : wheel.deltaY * stepF;
        if (specViewSize.widthF() + 2 * deltaF > specSize.widthF()) {
            deltaF = (specSize.widthF() - specViewSize.widthF()) / 2;
        }
        specViewSize.minF -= deltaF;
        specViewSize.maxF += deltaF;
        specViewSize.minT -= deltaT;
        specViewSize.maxT += deltaT;
        if (specViewSize.minT < specSize.minT) {
            specViewSize.maxT += specSize.minT - specViewSize.minT;
            specViewSize.minT += specSize.minT - specViewSize.minT;
        }
        if (specViewSize.maxT > specSize.maxT) {
            specViewSize.minT += specSize.maxT - specViewSize.maxT;
            specViewSize.maxT += specSize.maxT - specViewSize.maxT;
        }
        if (specViewSize.minF < specSize.minF) {
            specViewSize.maxF += specSize.minF - specViewSize.minF;
            specViewSize.minF += specSize.minF - specViewSize.minF;
        }
        if (specViewSize.maxF > specSize.maxF) {
            specViewSize.minF += specSize.maxF - specViewSize.maxF;
            specViewSize.maxF += specSize.maxF - specViewSize.maxF;
        }
    } else {
        var deltaT = (wheel.shiftKey ? -wheel.deltaY : wheel.deltaX) * stepT / 10;
        if (specViewSize.maxT + deltaT > specSize.maxT) {
            deltaT = specSize.maxT - specViewSize.maxT;
        }
        if (specViewSize.minT + deltaT < specSize.minT) {
            deltaT = specSize.minT - specViewSize.minT;
        }
        var deltaF = (wheel.shiftKey ? wheel.deltaX : -wheel.deltaY) * stepF / 10;
        if (specViewSize.maxF + deltaF > specSize.maxF) {
            deltaF = specSize.maxF - specViewSize.maxF;
        }
        if (specViewSize.minF + deltaF < specSize.minF) {
            deltaF = specSize.minF - specViewSize.minF;
        }
        specViewSize.minF += deltaF;
        specViewSize.maxF += deltaF;
        specViewSize.minT += deltaT;
        specViewSize.maxT += deltaT;
    }
    wheel.preventDefault();
    specView.onmousemove(wheel);
    window.requestAnimationFrame(drawScene);
}

/* update the specDataView with cursor position.

   The specDataView should contain the current cursor position in
   frequency/time coordinates. It is updated every time the mouse is
   moved on the spectrogram.
*/
specView.onmousemove = function(mouse) {
    var t = specViewSize.scaleT(mouse.layerX / specView.clientWidth);
    var f = specViewSize.scaleF(1 - mouse.layerY / specView.clientHeight);
    specDataView.innerHTML = formatTime(t) + ", " + formatFrequency(f) + "<br/>" +
        specViewSize.centerA().toFixed(2) + " dB " +
        "&plusmn; " + (specViewSize.widthA() / 2).toFixed(2) + " dB";
}

/* update spectrogram display mode on keypress */
window.onkeypress = function(e) {
    var specMode = -1;
    if (e.key === 'p') {
        specMode = 0;
    } else if (e.key === 'n') {
        specMode = 1;
    } else if (e.key === 'd') {
        specMode = 2;
    } else if (e.key === 'm') {
        specMode = 3;
    }
    // prevent the default action of submitting the GET parameters.
    e.which = e.which || e.keyCode;
    if (e.which === 13) {
      e.preventDefault();
    }

    document.getElementById('specMode').value = specMode;
    window.requestAnimationFrame(drawScene);
}
}
