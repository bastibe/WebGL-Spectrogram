function SpecSize(minT, maxT, minF, maxF, minA, maxA) {
    this.minT = minT;
    this.maxT = maxT;
    this.minF = minF;
    this.maxF = maxF;
    this.minA = minA;
    this.maxA = maxA;
}

SpecSize.prototype.widthT = function() {
    return this.maxT - this.minT;
}

SpecSize.prototype.widthF = function() {
    return this.maxF - this.minF;
}

SpecSize.prototype.widthA = function() {
    return this.maxA - this.minA;
}

SpecSize.prototype.centerT = function() {
    return (this.minT + this.maxT)/2;
}

SpecSize.prototype.centerF = function() {
    return (this.minF + this.maxF)/2;
}

SpecSize.prototype.centerA = function() {
    return (this.minA + this.maxA)/2;
}

SpecSize.prototype.scaleT = function(t) {
    return t * this.widthT() + this.minT;
}

SpecSize.prototype.scaleF = function(f) {
    return f * this.widthF() + this.minF;
}
