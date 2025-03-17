class BoxGeometry {
    constructor(h, w, d, alpha, g) {
        this.h = h;          // height
        this.w = w;          // width
        this.d = d;          // depth
        this.alpha = alpha;  // angle in degrees
        this.g = g;         // gap
        
        // Convert alpha to radians for calculations
        this.alphaRad = alpha * Math.PI / 180;
        
        // Calculate critical angle (when lid changes from triangle to quadrilateral)
        this.criticalAngle = Math.atan2(this.h, this.d);  // in radians
        
        // Initialize red points at default positions
        this.redOpenPoint = {
            x: this.w - this.g - this.d/2,
            y: this.h + this.d/2
        };
        this.updateRedClosedPoint();
        
        // Initialize red perpendicular point at center + 0.5*h up the perpendicular line
        this.redPerpPoint = {
            x: this.w/2,
            y: this.h + 0.5 * this.h
        };
        
        // Initialize blue points at default positions (different location)
        this.blueOpenPoint = {
            x: this.w - this.g - this.d/3,
            y: this.h + this.d/3
        };
        this.updateBlueClosedPoint();
        
        // Initialize blue perpendicular point at center - 0.5*h down the perpendicular line
        this.bluePerpPoint = {
            x: this.w/2,
            y: this.h - 0.5 * this.h
        };
    }

    // Get box vertices
    getBoxVertices() {
        if (this.alphaRad <= this.criticalAngle) {
            return [
                {x: 0, y: 0},                                // A
                {x: this.w, y: 0},                          // B
                {x: this.w, y: this.h},                     // C
                {x: this.d, y: this.h},                     // D
                {x: 0, y: this.h - this.d * Math.tan(this.alphaRad)} // E
            ];
        } else {
            return [
                {x: this.d - this.h / Math.tan(this.alphaRad), y: 0}, // A
                {x: this.w, y: 0},                          // B
                {x: this.w, y: this.h},                     // C
                {x: this.d, y: this.h}                      // D
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

    // Project a point onto a line segment
    projectPointOntoSegment(point, start, end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len2 = dx * dx + dy * dy;
        
        if (len2 === 0) return start;
        
        const t = Math.max(0, Math.min(1, 
            ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2
        ));
        
        return {
            x: start.x + t * dx,
            y: start.y + t * dy
        };
    }
    
    // Project a point onto a line
    projectPointOntoLine(point, lineStart, lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        const len2 = dx * dx + dy * dy;
        
        if (len2 === 0) return lineStart;
        
        const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / len2;
        
        return {
            x: lineStart.x + t * dx,
            y: lineStart.y + t * dy
        };
    }
    
    // Constrain a point to a line segment
    constrainPointToLineSegment(point, lineStart, lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        const len2 = dx * dx + dy * dy;
        
        if (len2 === 0) return lineStart;
        
        const t = Math.max(0, Math.min(1, 
            ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / len2
        ));
        
        return {
            x: lineStart.x + t * dx,
            y: lineStart.y + t * dy
        };
    }
    
    // Check if a point is inside a polygon
    isPointInPolygon(point, vertices) {
        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;
            
            const intersect = ((yi > point.y) !== (yj > point.y))
                && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
    
    // Constrain a point to the closed lid
    constrainPointToClosedLid(point) {
        const vertices = this.getClosedLidVertices();
        
        // If point is inside, return as is
        if (this.isPointInPolygon(point, vertices)) {
            return point;
        }
        
        // Otherwise, project onto nearest edge
        let bestPoint = null;
        let minDist = Infinity;
        
        for (let i = 0; i < vertices.length; i++) {
            const start = vertices[i];
            const end = vertices[(i + 1) % vertices.length];
            const projected = this.projectPointOntoSegment(point, start, end);
            
            const dx = point.x - projected.x;
            const dy = point.y - projected.y;
            const dist = dx * dx + dy * dy;
            
            if (dist < minDist) {
                minDist = dist;
                bestPoint = projected;
            }
        }
        
        return bestPoint;
    }
    
    // Constrain a point to the open lid
    constrainPointToOpenLid(point) {
        const vertices = this.getOpenLidVertices();
        
        // If point is inside, return as is
        if (this.isPointInPolygon(point, vertices)) {
            return point;
        }
        
        // Otherwise, project onto nearest edge
        let bestPoint = null;
        let minDist = Infinity;
        
        for (let i = 0; i < vertices.length; i++) {
            const start = vertices[i];
            const end = vertices[(i + 1) % vertices.length];
            const projected = this.projectPointOntoSegment(point, start, end);
            
            const dx = point.x - projected.x;
            const dy = point.y - projected.y;
            const dist = dx * dx + dy * dy;
            
            if (dist < minDist) {
                minDist = dist;
                bestPoint = projected;
            }
        }
        
        return bestPoint;
    }
    
    // Update the red closed point based on the open point
    updateRedClosedPoint() {
        const center = this.getCenterOfRotation();
        const dx = this.redOpenPoint.x - center.x;
        const dy = this.redOpenPoint.y - center.y;
        
        const unconstrained = {
            x: center.x - dx,
            y: center.y - dy
        };
        
        this.redClosedPoint = this.constrainPointToClosedLid(unconstrained);
    }
    
    // Update the blue closed point based on the open point
    updateBlueClosedPoint() {
        const center = this.getCenterOfRotation();
        const dx = this.blueOpenPoint.x - center.x;
        const dy = this.blueOpenPoint.y - center.y;
        
        const unconstrained = {
            x: center.x - dx,
            y: center.y - dy
        };
        
        this.blueClosedPoint = this.constrainPointToClosedLid(unconstrained);
    }
    
    // Move the red open point and update the closed point
    moveRedOpenPoint(point) {
        this.redOpenPoint = this.constrainPointToOpenLid(point);
        this.updateRedClosedPoint();
    }
    
    // Move the blue open point and update the closed point
    moveBlueOpenPoint(point) {
        this.blueOpenPoint = this.constrainPointToOpenLid(point);
        this.updateBlueClosedPoint();
    }
    
    // Move the red perpendicular point
    moveRedPerpPoint(point) {
        const line = this.getRedConnectionLine();
        this.redPerpPoint = this.constrainPointToLineSegment(point, line.perpStart, line.perpEnd);
    }
    
    // Move the blue perpendicular point
    moveBluePerpPoint(point) {
        const line = this.getBlueConnectionLine();
        this.bluePerpPoint = this.constrainPointToLineSegment(point, line.perpStart, line.perpEnd);
    }
    
    // Get the red connection line points and perpendicular line
    getRedConnectionLine() {
        const center = this.getCenterOfRotation();
        const dx = this.redOpenPoint.x - center.x;
        const dy = this.redOpenPoint.y - center.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        
        // Normalize direction vector
        const dirX = dx / len;
        const dirY = dy / len;
        
        // Calculate perpendicular vector (rotate 90 degrees)
        const perpX = -dirY;
        const perpY = dirX;
        
        // Calculate perpendicular line endpoints (1.25*h on each side)
        const perpLen = this.h * 1.25;
        const perpStart = {
            x: center.x - perpX * perpLen,
            y: center.y - perpY * perpLen
        };
        const perpEnd = {
            x: center.x + perpX * perpLen,
            y: center.y + perpY * perpLen
        };
        
        // Ensure perpendicular point stays on the line when the line moves
        this.redPerpPoint = this.constrainPointToLineSegment(this.redPerpPoint, perpStart, perpEnd);
        
        return {
            start: this.redClosedPoint,
            end: this.redOpenPoint,
            center: center,
            perpStart: perpStart,
            perpEnd: perpEnd,
            perpPoint: this.redPerpPoint
        };
    }
    
    // Get the blue connection line points and perpendicular line
    getBlueConnectionLine() {
        const center = this.getCenterOfRotation();
        const dx = this.blueOpenPoint.x - center.x;
        const dy = this.blueOpenPoint.y - center.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        
        // Normalize direction vector
        const dirX = dx / len;
        const dirY = dy / len;
        
        // Calculate perpendicular vector (rotate 90 degrees)
        const perpX = -dirY;
        const perpY = dirX;
        
        // Calculate perpendicular line endpoints (1.25*h on each side)
        const perpLen = this.h * 1.25;
        const perpStart = {
            x: center.x - perpX * perpLen,
            y: center.y - perpY * perpLen
        };
        const perpEnd = {
            x: center.x + perpX * perpLen,
            y: center.y + perpY * perpLen
        };
        
        // Ensure perpendicular point stays on the line when the line moves
        this.bluePerpPoint = this.constrainPointToLineSegment(this.bluePerpPoint, perpStart, perpEnd);
        
        return {
            start: this.blueClosedPoint,
            end: this.blueOpenPoint,
            center: center,
            perpStart: perpStart,
            perpEnd: perpEnd,
            perpPoint: this.bluePerpPoint
        };
    }
    
    // Check if a point is near enough to be selected
    isPointNearRedOpenPoint(point, threshold) {
        const dx = point.x - this.redOpenPoint.x;
        const dy = point.y - this.redOpenPoint.y;
        return dx * dx + dy * dy <= threshold * threshold;
    }
    
    isPointNearRedClosedPoint(point, threshold) {
        const dx = point.x - this.redClosedPoint.x;
        const dy = point.y - this.redClosedPoint.y;
        return dx * dx + dy * dy <= threshold * threshold;
    }
    
    isPointNearBlueOpenPoint(point, threshold) {
        const dx = point.x - this.blueOpenPoint.x;
        const dy = point.y - this.blueOpenPoint.y;
        return dx * dx + dy * dy <= threshold * threshold;
    }
    
    isPointNearBlueClosedPoint(point, threshold) {
        const dx = point.x - this.blueClosedPoint.x;
        const dy = point.y - this.blueClosedPoint.y;
        return dx * dx + dy * dy <= threshold * threshold;
    }
    
    isPointNearRedPerpPoint(point, threshold) {
        const dx = point.x - this.redPerpPoint.x;
        const dy = point.y - this.redPerpPoint.y;
        return dx * dx + dy * dy <= threshold * threshold;
    }
    
    isPointNearBluePerpPoint(point, threshold) {
        const dx = point.x - this.bluePerpPoint.x;
        const dy = point.y - this.bluePerpPoint.y;
        return dx * dx + dy * dy <= threshold * threshold;
    }
}
