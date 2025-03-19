class Vector2D {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    
    // Basic vector operations
    add(v) {
        return new Vector2D(this.x + v.x, this.y + v.y);
    }
    
    sub(v) {
        return new Vector2D(this.x - v.x, this.y - v.y);
    }
    
    mul(s) {
        return new Vector2D(this.x * s, this.y * s);
    }
    
    div(s) {
        return new Vector2D(this.x / s, this.y / s);
    }
    
    dot(v) {
        return this.x * v.x + this.y * v.y;
    }
    
    cross(v) {
        return this.x * v.y - this.y * v.x;
    }
    
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    
    lengthSq() {
        return this.x * this.x + this.y * this.y;
    }
    
    normalize() {
        const len = this.length();
        return len > 0 ? this.div(len) : new Vector2D(0, 0);
    }
    
    angle() {
        return Math.atan2(this.y, this.x);
    }
    
    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Vector2D(
            this.x * cos - this.y * sin,
            this.x * sin + this.y * cos
        );
    }
    
    clone() {
        return new Vector2D(this.x, this.y);
    }
    
    toString() {
        return `(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`;
    }
    
    // Create vector from angle and length
    static fromAngle(angle, length = 1) {
        return new Vector2D(
            length * Math.cos(angle),
            length * Math.sin(angle)
        );
    }
    
    // Calculate angle between two vectors
    static angle(v1, v2) {
        return Math.atan2(v1.cross(v2), v1.dot(v2));
    }
    
    // Linear interpolation between vectors
    static lerp(v1, v2, t) {
        return v1.add(v2.sub(v1).mul(t));
    }
    
    // Find intersection points of two circles
    static circleIntersection(c1, r1, c2, r2) {
        const d = c2.sub(c1).length();
        
        // Check if circles are too far apart or too close together
        if (d > r1 + r2 || d < Math.abs(r1 - r2)) {
            return [];  // No intersection
        }
        
        // Check if circles are coincident
        if (d < 1e-10 && Math.abs(r1 - r2) < 1e-10) {
            return [];  // Infinite solutions
        }
        
        // Calculate intersection points
        const a = (r1*r1 - r2*r2 + d*d) / (2*d);
        const h = Math.sqrt(Math.max(0, r1*r1 - a*a));
        
        const p2 = c1.add(c2.sub(c1).mul(a/d));
        const dx = -h * (c2.y - c1.y) / d;
        const dy = h * (c2.x - c1.x) / d;
        
        return [
            new Vector2D(p2.x + dx, p2.y + dy),
            new Vector2D(p2.x - dx, p2.y - dy)
        ];
    }
}
