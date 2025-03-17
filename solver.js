class FourBarSolver {
    constructor(h, w, d, alpha, g) {
        this.h = h;          // height
        this.w = w;          // width
        this.d = d;          // depth
        this.alpha = alpha;  // angle in degrees
        this.g = g;         // gap
        
        // Convert alpha to radians for calculations
        this.alphaRad = alpha * Math.PI / 180;
        this.criticalAngle = Math.atan(h/d);  // in radians
    }

    // Get box vertices
    getBoxVertices() {
        if (this.alphaRad <= this.criticalAngle) {
            return [
                {x: 0, y: 0},                                // (0,0)
                {x: this.w, y: 0},                          // (w,0)
                {x: this.w, y: this.h},                     // (w,h)
                {x: this.d, y: this.h},                     // (d,h)
                {x: 0, y: this.h - this.d * Math.tan(this.alphaRad)} // (0,h-d*tan(alpha))
            ];
        } else {
            return [
                {x: this.d - this.h / Math.tan(this.alphaRad), y: 0}, // (d-h/tan(alpha),0)
                {x: this.w, y: 0},                          // (w,0)
                {x: this.w, y: this.h},                     // (w,h)
                {x: this.d, y: this.h}                      // (d,h)
            ];
        }
    }
    
    // Get closed lid vertices
    getClosedLidVertices() {
        if (this.alphaRad <= this.criticalAngle) {
            return [
                {x: 0, y: this.h},                           // A
                {x: this.d, y: this.h},                      // B
                {x: 0, y: this.h - this.d * Math.tan(this.alphaRad)} // C
            ];
        } else {
            return [
                {x: 0, y: this.h},                           // A
                {x: this.d, y: this.h},                      // B
                {x: this.d - this.h / Math.tan(this.alphaRad), y: 0}, // C
                {x: 0, y: 0}                                 // D
            ];
        }
    }
    
    // Get open lid vertices
    getOpenLidVertices() {
        if (this.alphaRad <= this.criticalAngle) {
            return [
                {x: this.w - this.g, y: this.h},                      // A'
                {x: this.w - this.g - this.d, y: this.h},            // B'
                {x: this.w - this.g, y: this.h + this.d * Math.tan(this.alphaRad)} // C'
            ];
        } else {
            return [
                {x: this.w - this.g, y: this.h},                      // A'
                {x: this.w - this.g - this.d, y: this.h},            // B'
                {x: this.w - this.g - this.d + this.h / Math.tan(this.alphaRad), y: 2 * this.h}, // C'
                {x: this.w - this.g, y: 2 * this.h}                  // D'
            ];
        }
    }

    // Get center of rotation
    getCenterOfRotation() {
        return {
            x: (this.w - this.g)/2,
            y: this.h
        };
    }
}
