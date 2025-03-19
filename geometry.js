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
            )
        };
    }
    
    updateFourBarPosition(newInputAngle) {
        const fb = this.fourBarConfig;
        if (!fb) return false;
        
        // Store previous state
        fb.prevOutputEnd = fb.outputEnd ? {x: fb.outputEnd.x, y: fb.outputEnd.y} : null;
        
        // Calculate input end position using angle
        const newInputEnd = {
            x: fb.leftPivot.x + fb.inputLength * Math.cos(newInputAngle),
            y: fb.leftPivot.y + fb.inputLength * Math.sin(newInputAngle)
        };
        
        // Check if this is a valid configuration
        if (!this.isValidConfiguration(
            newInputEnd, 
            fb.leftPivot, 
            fb.rightPivot, 
            fb.inputLength, 
            fb.followerLength, 
            fb.outputLength
        )) {
            return false;
        }
        
        fb.inputEnd = newInputEnd;
        fb.inputAngle = newInputAngle;
        
        // Find intersection of two circles
        const intersections = this.circleIntersection(
            fb.inputEnd,
            fb.rightPivot,
            fb.followerLength,
            fb.outputLength
        );
        
        if (intersections.length === 0) {
            if (fb.prevOutputEnd) {
                fb.outputEnd = fb.prevOutputEnd;
            }
            return false;
        }
        
        // Choose configuration based on high/low selection
        const [pos1, pos2] = intersections;
        
        if (!fb.prevOutputEnd) {
            // First position - use config setting
            fb.outputEnd = pos1.y > pos2.y ? 
                (fb.config === 0 ? pos1 : pos2) : 
                (fb.config === 0 ? pos2 : pos1);
        } else {
            // Choose closest point to previous position
            const d1 = Math.pow(pos1.x - fb.prevOutputEnd.x, 2) + Math.pow(pos1.y - fb.prevOutputEnd.y, 2);
            const d2 = Math.pow(pos2.x - fb.prevOutputEnd.x, 2) + Math.pow(pos2.y - fb.prevOutputEnd.y, 2);
            
            fb.outputEnd = d1 < d2 ? pos1 : pos2;
            
            // Update configuration based on chosen point
            fb.config = fb.outputEnd.y > fb.inputEnd.y ? 0 : 1;
        }
        
        return true;
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
        this.redOpenPoint = point;
        this.updateRedClosedPoint();
        this.updateConstraintLines();
        
        // Update box point to stay on new constraint line
        const center = this.centerOfRotation;
        const redLen = this.height * 0.5;  // Keep same distance from center
        this.redBoxPoint = {
            x: center.x - this.redConstraintLine.perpX * redLen,
            y: center.y - this.redConstraintLine.perpY * redLen
        };
    }
    
    moveBlueOpenPoint(point) {
        this.blueOpenPoint = point;
        this.updateBlueClosedPoint();
        this.updateConstraintLines();
        
        // Update box point to stay on new constraint line
        const center = this.centerOfRotation;
        const blueLen = this.height * -0.5;  // Keep same distance from center
        this.blueBoxPoint = {
            x: center.x - this.blueConstraintLine.perpX * blueLen,
            y: center.y - this.blueConstraintLine.perpY * blueLen
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
}
