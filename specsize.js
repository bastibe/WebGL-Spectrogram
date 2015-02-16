/* the size of a spectrogram in time, frequency and amplitude */
function SpecSize(minT, maxT, minF, maxF, minA, maxA) {
    this.minT = minT;
    this.maxT = maxT;
    this.minF = minF;
    this.maxF = maxF;
    this.minA = minA;
    this.maxA = maxA;
}

/* the size in time */
SpecSize.prototype.widthT = function() {
    return this.maxT - this.minT;
}

/* the size in frequency */
SpecSize.prototype.widthF = function() {
    return this.maxF - this.minF;
}

/* the size in amplitude */
SpecSize.prototype.widthA = function() {
    return this.maxA - this.minA;
}

/* the center in time */
SpecSize.prototype.centerT = function() {
    return (this.minT + this.maxT) / 2;
}

/* the center in frequency */
SpecSize.prototype.centerF = function() {
    return (this.minF + this.maxF) / 2;
}

/* the center in amplitude */
SpecSize.prototype.centerA = function() {
    return (this.minA + this.maxA) / 2;
}

/* the relative position of a time */
SpecSize.prototype.scaleT = function(t) {
    return t * this.widthT() + this.minT;
}

/* the relative position of a frequency */
SpecSize.prototype.scaleF = function(f) {
    return f * this.widthF() + this.minF;
}

/* the relative position of a amplitude */
SpecSize.prototype.scaleA = function(a) {
    return a * this.widthA() + this.minA;
}
