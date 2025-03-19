class BoxGeometry {
    constructor(height, width, depth, angle, gap) {
        // Box dimensions
        this.height = height;
        this.width = width;
        this.depth = depth;
        this.gap = gap || 0;
        
        // Lid angle
        this.closedAngle = angle * Math.PI / 180;
        this.openAngle = Math.PI - this.closedAngle;
        
        // Initialize pivot points
        this.redBoxPoint = null;
        this.blueBoxPoint = null;
        this.redClosedPoint = null;
        this.blueClosedPoint = null;
        this.redOpenPoint = null;
        this.blueOpenPoint = null;
        
        // Initialize center of rotation
        this.centerOfRotation = null;
        
        // Initialize constraint lines
        this.redConstraintLine = null;
        this.blueConstraintLine = null;
        
        // Animation state
        this.isAnimating = false;
        this.animationStartTime = null;
        this.animationStartAngle = null;
        
        // Four-bar linkage solver
        this.fourBarConfig = null;
        
        // Initialize pivot points and constraints
        this.initializePivotPoints();
        this.updateConstraintLines();
        
        // Initialize four-bar linkage
        this.initializeFourBar();
    }
    
    // Four-bar linkage solver
    isValidConfiguration(inputEnd, leftPivot, rightPivot, inputLength, followerLength, outputLength) {
        // Check if input bar length is maintained
        const currentInputLength = this.distance(inputEnd, leftPivot);
        if (Math.abs(currentInputLength - inputLength) > 0.1) {
            return false;
        }
        
        // Check if configuration is possible (triangle inequality)
        const rightToInput = this.distance(inputEnd, rightPivot);
        
        // Sum of follower and output must be >= distance between their pivots
        if (rightToInput > followerLength + outputLength) {
            return false;
        }
        
        // Difference of follower and output must be <= distance between their pivots
        if (rightToInput < Math.abs(followerLength - outputLength)) {
            return false;
        }
        
        return true;
    }
    
    circleIntersection(jointA, jointB, lengthA, lengthB) {
        const dx = jointB.x - jointA.x;
        const dy = jointB.y - jointA.y;
        const Lc = Math.sqrt(dx * dx + dy * dy);
        
        // Check if circles are too far apart or too close
        if (Lc > lengthA + lengthB || Lc < Math.abs(lengthA - lengthB)) {
            return [];
        }
        
        // Check if circles are coincident
        if (Lc < 1e-10 && Math.abs(lengthA - lengthB) < 1e-10) {
            return [];
        }
        
        // Calculate intersection points using their method
        const bb = ((lengthB * lengthB) - (lengthA * lengthA) + (Lc * Lc)) / (Lc * 2);
        const h = Math.sqrt(Math.max(0, lengthB * lengthB - bb * bb));
        
        const Xp = jointB.x + ((bb * (jointA.x - jointB.x)) / Lc);
        const Yp = jointB.y + ((bb * (jointA.y - jointB.y)) / Lc);
        
        // Calculate both intersection points
        const Xsol1 = Xp + ((h * (jointB.y - jointA.y)) / Lc);
        const Ysol1 = Yp - ((h * (jointA.x - jointB.x)) / Lc);
        const Xsol2 = Xp - ((h * (jointB.y - jointA.y)) / Lc);
        const Ysol2 = Yp + ((h * (jointA.x - jointB.x)) / Lc);
        
        return [
            {x: Xsol1, y: Ysol1},
            {x: Xsol2, y: Ysol2}
        ];
    }
    
    initializeFourBar() {
        // Use current closed points and box points for initialization
        this.fourBarConfig = {
            leftPivot: this.redBoxPoint,
            rightPivot: this.blueBoxPoint,
            inputEnd: this.redClosedPoint,
            outputEnd: this.blueClosedPoint,
            inputLength: this.distance(this.redBoxPoint, this.redClosedPoint),
            outputLength: this.distance(this.blueBoxPoint, this.blueClosedPoint),
            followerLength: this.distance(this.redClosedPoint, this.blueClosedPoint),
            inputAngle: Math.atan2(
                this.redClosedPoint.y - this.redBoxPoint.y,
                this.redClosedPoint.x - this.redBoxPoint.x
            ),
            // Store configuration (above/below input link)
            config: this.blueClosedPoint.y > this.redClosedPoint.y ? 1 : 0
        };
    }
    
    updateFourBarPosition(angle) {
        if (!this.fourBarConfig) return false;
        
        // Store current state
        const prevConfig = { ...this.fourBarConfig };
        
        // Update input angle
        this.fourBarConfig.inputAngle = angle;
        
        // Calculate new input end position
        this.fourBarConfig.inputEnd = {
            x: this.fourBarConfig.leftPivot.x + Math.cos(angle) * this.fourBarConfig.inputLength,
            y: this.fourBarConfig.leftPivot.y + Math.sin(angle) * this.fourBarConfig.inputLength
        };
        
        // Find intersection of follower and output circles
        const intersections = this.circleIntersection(
            this.fourBarConfig.inputEnd,
            this.fourBarConfig.rightPivot,
            this.fourBarConfig.followerLength,
            this.fourBarConfig.outputLength
        );
        
        if (intersections.length === 0) {
            // No valid configuration - revert
            this.fourBarConfig = prevConfig;
            return false;
        }
        
        // Choose intersection closest to previous output end
        const [pos1, pos2] = intersections;
        if (prevConfig.outputEnd) {
            const d1 = this.distance(pos1, prevConfig.outputEnd);
            const d2 = this.distance(pos2, prevConfig.outputEnd);
            this.fourBarConfig.outputEnd = d1 < d2 ? pos1 : pos2;
            
            // Update configuration based on chosen point
            this.fourBarConfig.config = this.fourBarConfig.outputEnd.y > this.fourBarConfig.inputEnd.y ? 1 : 0;
        } else {
            // If no previous position (shouldn't happen), maintain current config
            this.fourBarConfig.outputEnd = this.fourBarConfig.config === 1 ?
                (pos1.y > this.fourBarConfig.inputEnd.y ? pos1 : pos2) :
                (pos1.y <= this.fourBarConfig.inputEnd.y ? pos1 : pos2);
        }
        
        // Verify lengths are maintained with 1% tolerance
        const newInputLength = this.distance(this.fourBarConfig.leftPivot, this.fourBarConfig.inputEnd);
        const newFollowerLength = this.distance(this.fourBarConfig.inputEnd, this.fourBarConfig.outputEnd);
        const newOutputLength = this.distance(this.fourBarConfig.rightPivot, this.fourBarConfig.outputEnd);
        
        const inputError = Math.abs(newInputLength - this.fourBarConfig.inputLength) / this.fourBarConfig.inputLength;
        const followerError = Math.abs(newFollowerLength - this.fourBarConfig.followerLength) / this.fourBarConfig.followerLength;
        const outputError = Math.abs(newOutputLength - this.fourBarConfig.outputLength) / this.fourBarConfig.outputLength;
        
        if (inputError > 0.01 || followerError > 0.01 || outputError > 0.01) {
            // Lengths not maintained within 1% - revert
            this.fourBarConfig = prevConfig;
            return false;
        }
        
        return true;
    }
    
    circleIntersection(c1, c2, r1, r2) {
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        
        // Check if circles are too far apart or too close
        if (d > r1 + r2 || d < Math.abs(r1 - r2)) {
            return [];
        }
        
        // Check if circles are coincident
        if (d < 1e-10 && Math.abs(r1 - r2) < 1e-10) {
            return [];
        }
        
        const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));  // Use max to avoid negative sqrt
        
        const x2 = c1.x + (dx * a) / d;
        const y2 = c1.y + (dy * a) / d;
        
        const rx = -dy * (h / d);
        const ry = dx * (h / d);
        
        return [
            {x: x2 + rx, y: y2 + ry},
            {x: x2 - rx, y: y2 - ry}
        ];
    }
    
    // Helper to calculate distance between two points
    distance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    initializePivotPoints() {
        // Initialize center of rotation
        this.centerOfRotation = {
            x: (this.width - this.gap)/2,
            y: this.height
        };
        
        // Initialize red points at default positions
        this.redOpenPoint = {
            x: this.width - this.gap - this.depth/2,
            y: this.height + this.depth/2
        };
        
        // Initialize blue points at default positions (different location)
        this.blueOpenPoint = {
            x: this.width - this.gap - this.depth/3,
            y: this.height + this.depth/3
        };
        
        // Calculate closed points from open points
        this.updateRedClosedPoint();
        this.updateBlueClosedPoint();
        
        // Update constraint lines before placing box points
        this.updateConstraintLines();
        
        // Initialize box points on their constraint lines
        // Red box point at 0.5 * height up the perpendicular line
        const redLen = this.height * 0.5;
        this.redBoxPoint = {
            x: this.centerOfRotation.x - this.redConstraintLine.perpX * redLen,
            y: this.centerOfRotation.y - this.redConstraintLine.perpY * redLen
        };
        
        // Blue box point at -0.5 * height down the perpendicular line
        const blueLen = this.height * -0.5;
        this.blueBoxPoint = {
            x: this.centerOfRotation.x - this.blueConstraintLine.perpX * blueLen,
            y: this.centerOfRotation.y - this.blueConstraintLine.perpY * blueLen
        };
    }
    
    updateConstraintLines() {
        const center = this.centerOfRotation;
        
        // Red constraint line
        const redDx = this.redOpenPoint.x - center.x;
        const redDy = this.redOpenPoint.y - center.y;
        const redLen = Math.sqrt(redDx * redDx + redDy * redDy);
        const redDirX = redDx / redLen;
        const redDirY = redDy / redLen;
        
        // Calculate box vector (rotate 90 degrees)
        const redPerpX = -redDirY;
        const redPerpY = redDirX;
        
        // Store perpendicular direction for box point initialization
        this.redConstraintLine = {
            perpX: redPerpX,
            perpY: redPerpY,
            perpStart: {
                x: center.x - redPerpX * this.height * 1.25,
                y: center.y - redPerpY * this.height * 1.25
            },
            perpEnd: {
                x: center.x + redPerpX * this.height * 1.25,
                y: center.y + redPerpY * this.height * 1.25
            }
        };
        
        // Blue constraint line (similar calculation)
        const blueDx = this.blueOpenPoint.x - center.x;
        const blueDy = this.blueOpenPoint.y - center.y;
        const blueLen = Math.sqrt(blueDx * blueDx + blueDy * blueDy);
        const blueDirX = blueDx / blueLen;
        const blueDirY = blueDy / blueLen;
        
        const bluePerpX = -blueDirY;
        const bluePerpY = blueDirX;
        
        // Store perpendicular direction for box point initialization
        this.blueConstraintLine = {
            perpX: bluePerpX,
            perpY: bluePerpY,
            perpStart: {
                x: center.x - bluePerpX * this.height * 1.25,
                y: center.y - bluePerpY * this.height * 1.25
            },
            perpEnd: {
                x: center.x + bluePerpX * this.height * 1.25,
                y: center.y + bluePerpY * this.height * 1.25
            }
        };
    }
    
    // Get box vertices
    getBoxVertices() {
        const criticalAngle = Math.atan2(this.height, this.depth);
        
        if (this.closedAngle <= criticalAngle) {
            return [
                {x: 0, y: 0},                                // A
                {x: this.width, y: 0},                      // B
                {x: this.width, y: this.height},            // C
                {x: this.depth, y: this.height},            // D
                {x: 0, y: this.height - this.depth * Math.tan(this.closedAngle)} // E
            ];
        } else {
            return [
                {x: this.depth - this.height / Math.tan(this.closedAngle), y: 0}, // A
                {x: this.width, y: 0},                      // B
                {x: this.width, y: this.height},            // C
                {x: this.depth, y: this.height}             // D
            ];
        }
    }
    
    // Get closed lid vertices
    getClosedLidVertices() {
        const criticalAngle = Math.atan2(this.height, this.depth);
        
        if (this.closedAngle <= criticalAngle) {
            return [
                {x: 0, y: this.height},                     // A
                {x: this.depth, y: this.height},            // B
                {x: 0, y: this.height - this.depth * Math.tan(this.closedAngle)} // C
            ];
        } else {
            return [
                {x: 0, y: this.height},                     // A
                {x: this.depth, y: this.height},            // B
                {x: this.depth - this.height / Math.tan(this.closedAngle), y: 0}, // C
                {x: 0, y: 0}                               // D
            ];
        }
    }
    
    // Get open lid vertices
    getOpenLidVertices() {
        const criticalAngle = Math.atan2(this.height, this.depth);
        
        if (this.closedAngle <= criticalAngle) {
            return [
                {x: this.width - this.gap, y: this.height},                    // A'
                {x: this.width - this.gap - this.depth, y: this.height},      // B'
                {x: this.width - this.gap, y: this.height + this.depth * Math.tan(this.closedAngle)} // C'
            ];
        } else {
            return [
                {x: this.width - this.gap, y: this.height},                    // A'
                {x: this.width - this.gap - this.depth, y: this.height},      // B'
                {x: this.width - this.gap - this.depth + this.height / Math.tan(this.closedAngle), y: 2 * this.height}, // C'
                {x: this.width - this.gap, y: 2 * this.height}               // D'
            ];
        }
    }
    
    // Update the red closed point based on the open point
    updateRedClosedPoint() {
        const center = this.centerOfRotation;
        const dx = this.redOpenPoint.x - center.x;
        const dy = this.redOpenPoint.y - center.y;
        
        this.redClosedPoint = {
            x: center.x - dx,
            y: center.y - dy
        };
    }
    
    // Update the blue closed point based on the open point
    updateBlueClosedPoint() {
        const center = this.centerOfRotation;
        const dx = this.blueOpenPoint.x - center.x;
        const dy = this.blueOpenPoint.y - center.y;
        
        this.blueClosedPoint = {
            x: center.x - dx,
            y: center.y - dy
        };
    }
    
    // Get four-bar linkage points
    getFourBarPoints() {
        if (!this.fourBarConfig) return null;
        
        return {
            redBox: this.fourBarConfig.leftPivot,
            redClosed: this.fourBarConfig.inputEnd,
            blueClosed: this.fourBarConfig.outputEnd,
            blueBox: this.fourBarConfig.rightPivot
        };
    }
    
    // Move points with constraints
    moveRedOpenPoint(point) {
        // Constrain to lid boundaries
        const lidVertices = this.getOpenLidVertices();
        if (!this.isPointInPolygon(point, lidVertices)) {
            return;
        }
        
        // Store which side of the line we're on before updating
        const center = this.centerOfRotation;
        const currentDist = this.distance(this.redBoxPoint, center);
        
        // Calculate side using cross product of (closed->open) and (closed->boxpoint)
        const v1 = {
            x: this.redOpenPoint.x - this.redClosedPoint.x,
            y: this.redOpenPoint.y - this.redClosedPoint.y
        };
        const v2 = {
            x: this.redOpenPoint.x - this.redBoxPoint.x,
            y: this.redOpenPoint.y - this.redBoxPoint.y
        };
        const currentSide = Math.sign(v1.x * v2.y - v1.y * v2.x);
        
        this.redOpenPoint = point;
        this.updateRedClosedPoint();
        this.updateConstraintLines();
        
        // Update box point to stay on new constraint line, maintaining distance and side
        this.redBoxPoint = {
            x: center.x - this.redConstraintLine.perpX * currentDist * currentSide,
            y: center.y - this.redConstraintLine.perpY * currentDist * currentSide
        };
    }
    
    moveBlueOpenPoint(point) {
        // Constrain to lid boundaries
        const lidVertices = this.getOpenLidVertices();
        if (!this.isPointInPolygon(point, lidVertices)) {
            return;
        }
        
        // Store which side of the line we're on before updating
        const center = this.centerOfRotation;
        const currentDist = this.distance(this.blueBoxPoint, center);
        
        // Calculate side using cross product of (closed->open) and (closed->boxpoint)
        const v1 = {
            x: this.blueOpenPoint.x - this.blueClosedPoint.x,
            y: this.blueOpenPoint.y - this.blueClosedPoint.y
        };
        const v2 = {
            x: this.blueOpenPoint.x - this.blueBoxPoint.x,
            y: this.blueOpenPoint.y - this.blueBoxPoint.y
        };
        const currentSide = Math.sign(v1.x * v2.y - v1.y * v2.x);
        
        this.blueOpenPoint = point;
        this.updateBlueClosedPoint();
        this.updateConstraintLines();
        
        // Update box point to stay on new constraint line, maintaining distance and side
        this.blueBoxPoint = {
            x: center.x - this.blueConstraintLine.perpX * currentDist * currentSide,
            y: center.y - this.blueConstraintLine.perpY * currentDist * currentSide
        };
    }
    
    moveRedBoxPoint(point) {
        if (!this.redConstraintLine) return;
        
        // Project point onto constraint line
        const line = this.redConstraintLine;
        this.redBoxPoint = this.projectPointOntoLineSegment(point, line.perpStart, line.perpEnd);
    }
    
    moveBlueBoxPoint(point) {
        if (!this.blueConstraintLine) return;
        
        // Project point onto constraint line
        const line = this.blueConstraintLine;
        this.blueBoxPoint = this.projectPointOntoLineSegment(point, line.perpStart, line.perpEnd);
    }
    
    // Helper to project point onto line segment
    projectPointOntoLineSegment(point, start, end) {
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
    
    // Get red connection line
    getRedConnectionLine() {
        if (!this.redBoxPoint || !this.redOpenPoint || !this.redClosedPoint) return null;
        
        return {
            boxPoint: this.redBoxPoint,
            start: this.redClosedPoint,
            end: this.redOpenPoint,
            perpStart: this.redConstraintLine ? this.redConstraintLine.perpStart : null,
            perpEnd: this.redConstraintLine ? this.redConstraintLine.perpEnd : null
        };
    }
    
    // Get blue connection line
    getBlueConnectionLine() {
        if (!this.blueBoxPoint || !this.blueOpenPoint || !this.blueClosedPoint) return null;
        
        return {
            boxPoint: this.blueBoxPoint,
            start: this.blueClosedPoint,
            end: this.blueOpenPoint,
            perpStart: this.blueConstraintLine ? this.blueConstraintLine.perpStart : null,
            perpEnd: this.blueConstraintLine ? this.blueConstraintLine.perpEnd : null
        };
    }
    
    // Point selection helpers
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
    
    isPointNearRedBoxPoint(point, threshold) {
        const dx = point.x - this.redBoxPoint.x;
        const dy = point.y - this.redBoxPoint.y;
        return dx * dx + dy * dy <= threshold * threshold;
    }
    
    isPointNearBlueBoxPoint(point, threshold) {
        const dx = point.x - this.blueBoxPoint.x;
        const dy = point.y - this.blueBoxPoint.y;
        return dx * dx + dy * dy <= threshold * threshold;
    }
    
    // Get center of rotation
    getCenterOfRotation() {
        return this.centerOfRotation;
    }
    
    // Animation methods
    startAnimation() {
        this.isAnimating = true;
        this.animationStartTime = Date.now();
        this.animationStartAngle = this.fourBarConfig ? this.fourBarConfig.inputAngle : 0;
    }
    
    stopAnimation() {
        this.isAnimating = false;
    }
    
    updateAnimation() {
        if (!this.isAnimating || !this.fourBarConfig) return;
        
        const elapsedTime = Date.now() - this.animationStartTime;
        const angularSpeed = Math.PI / 2;  // π/2 radians per second
        const deltaAngle = (angularSpeed * elapsedTime / 1000) % (2 * Math.PI);
        
        const newAngle = this.animationStartAngle + deltaAngle;
        if (!this.updateFourBarPosition(newAngle)) {
            // If we can't update to this position, try reversing direction
            this.updateFourBarPosition(this.animationStartAngle - deltaAngle);
        }
    }
    
    // Get all points for visualization
    getPoints() {
        const points = [];
        
        if (this.redBoxPoint) points.push(this.redBoxPoint);
        if (this.redOpenPoint) points.push(this.redOpenPoint);
        if (this.redClosedPoint) points.push(this.redClosedPoint);
        
        if (this.blueBoxPoint) points.push(this.blueBoxPoint);
        if (this.blueOpenPoint) points.push(this.blueOpenPoint);
        if (this.blueClosedPoint) points.push(this.blueClosedPoint);
        
        return points;
    }
    
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
    
    getValidAngleRange() {
        const center = this.centerOfRotation;
        const boxPivot = this.redBoxPoint;
        const closedPivot = this.redClosedPoint;
        const openPivot = this.redOpenPoint;
        
        // Calculate angles from box pivot to closed and open positions
        const closedAngle = Math.atan2(
            closedPivot.y - boxPivot.y,
            closedPivot.x - boxPivot.x
        );
        const openAngle = Math.atan2(
            openPivot.y - boxPivot.y,
            openPivot.x - boxPivot.x
        );
        
        // Normalize angles to 0-2π range
        let normClosedAngle = (closedAngle + 2*Math.PI) % (2*Math.PI);
        let normOpenAngle = (openAngle + 2*Math.PI) % (2*Math.PI);
        
        // We want the arc that goes clockwise from closed to open
        // If open angle is counterclockwise from closed, add 2π to make it clockwise
        if (normOpenAngle > normClosedAngle) {
            normOpenAngle -= 2*Math.PI;
        }
        
        return {
            start: normClosedAngle,
            end: normOpenAngle,
            isClockwise: true  // Always clockwise from closed to open
        };
    }
    
    constrainAngleToValidRange(angle) {
        const range = this.getValidAngleRange();
        
        // Normalize input angle to 0-2π
        let normAngle = (angle + 2*Math.PI) % (2*Math.PI);
        
        // If angle is counterclockwise from start, subtract 2π to make it clockwise
        if (normAngle > range.start) {
            normAngle -= 2*Math.PI;
        }
        
        // Constrain to range (remember, end is less than start since we're going clockwise)
        return Math.max(range.end, Math.min(range.start, normAngle));
    }
    
    isValidRangeReachable() {
        const range = this.getValidAngleRange();
        const fb = this.fourBarConfig;
        if (!fb) return false;
        
        // Store current configuration
        const prevConfig = { ...fb };
        
        // Check angles at regular intervals
        const numSteps = 36;  // Check every 10 degrees
        const angleStep = (range.start - range.end) / numSteps;
        
        for (let i = 0; i <= numSteps; i++) {
            const angle = range.start - i * angleStep;
            
            // Update input end position
            const inputEnd = {
                x: fb.leftPivot.x + Math.cos(angle) * fb.inputLength,
                y: fb.leftPivot.y + Math.sin(angle) * fb.inputLength
            };
            
            // Check if circles intersect at this angle
            const intersections = this.circleIntersection(
                inputEnd,
                fb.rightPivot,
                fb.followerLength,
                fb.outputLength
            );
            
            if (intersections.length === 0) {
                // Restore original configuration
                Object.assign(fb, prevConfig);
                return false;
            }
        }
        
        // Restore original configuration
        Object.assign(fb, prevConfig);
        return true;
    }
}
