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
        this.lastFollowerChoice = null; // Store which intersection we're using
        
        // Four-bar linkage solver
        this.fourBarConfig = null;
        
        // Moving lid state
        this.movingLidVertices = null;
        this.previousFollowerStart = null;
        this.previousFollowerEnd = null;
        
        // Initialize pivot points
        this.initializePivotPoints();
        this.updateConstraintLines();
        this.initializeFourBar();
    }
    
    // Four-bar linkage solver
    isValidConfiguration(inputFollower, inputGround, outputGround, inputLength, followerLength, outputLength) {
        // Check if input bar length is maintained
        const currentInputLength = this.distance(inputFollower, inputGround);
        if (Math.abs(currentInputLength - inputLength) > 0.1) {
            return false;
        }
        
        // Check if configuration is possible (triangle inequality)
        const rightToInput = this.distance(inputFollower, outputGround);
        
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
        const d = Math.sqrt(dx * dx + dy * dy);
        
        // Check if circles are too far apart or too close
        if (d > lengthA + lengthB || d < Math.abs(lengthA - lengthB)) {
            return [];
        }
        
        // Check if circles are coincident
        if (d < 1e-10 && Math.abs(lengthA - lengthB) < 1e-10) {
            return [];
        }
        
        const a = (lengthA * lengthA - lengthB * lengthB + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, lengthA * lengthA - a * a));  // Use max to avoid negative sqrt
        
        const x2 = jointA.x + (dx * a) / d;
        const y2 = jointA.y + (dy * a) / d;
        
        const rx = -dy * (h / d);
        const ry = dx * (h / d);
        
        return [
            {x: x2 + rx, y: y2 + ry},
            {x: x2 - rx, y: y2 - ry}
        ];
    }
    
    initializeFourBar() {
        // Don't initialize four-bar linkage until animation starts
        this.fourBarConfig = null;
        this.movingLidVertices = null;
    }
    
    updateFourBarPosition(angle) {
        if (!this.fourBarConfig) return false;
        
        // Store previous follower positions before updating
        const oldPoints = this.getFourBarPoints();
        this.previousFollowerStart = {...oldPoints.redClosed};
        this.previousFollowerEnd = {...oldPoints.blueClosed};

        // Store current state
        const prevConfig = { ...this.fourBarConfig };
        
        // Update input angle
        this.fourBarConfig.inputAngle = angle;
        
        // Calculate new input follower position
        this.fourBarConfig.inputFollower = {
            x: this.fourBarConfig.inputGround.x + Math.cos(angle) * this.fourBarConfig.inputLength,
            y: this.fourBarConfig.inputGround.y + Math.sin(angle) * this.fourBarConfig.inputLength
        };
        
        // Find intersection of follower and output circles
        const intersections = this.circleIntersection(
            this.fourBarConfig.inputFollower,
            this.fourBarConfig.outputGround,
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
        if (prevConfig.outputFollower) {
            const d1 = this.distance(pos1, prevConfig.outputFollower);
            const d2 = this.distance(pos2, prevConfig.outputFollower);
            this.fourBarConfig.outputFollower = d1 < d2 ? pos1 : pos2;
            this.lastFollowerChoice = d1 < d2 ? 0 : 1; // Store which intersection we chose
        } else if (this.lastFollowerChoice !== null) {
            // Use last known choice if available
            this.fourBarConfig.outputFollower = intersections[this.lastFollowerChoice];
        } else {
            // If no previous position, maintain current config
            this.fourBarConfig.outputFollower = this.fourBarConfig.config === 1 ?
                (pos1.y > this.fourBarConfig.inputFollower.y ? pos1 : pos2) :
                (pos1.y <= this.fourBarConfig.inputFollower.y ? pos1 : pos2);
            // Store initial choice
            this.lastFollowerChoice = this.fourBarConfig.outputFollower === pos1 ? 0 : 1;
        }
        
        // Create some vectors to help with the transformation
        // Let C (Closed) be the vector from redClosed to blueClosed
        const C = math.matrix([this.blueClosedPoint.x - this.redClosedPoint.x, this.blueClosedPoint.y - this.redClosedPoint.y]);
        const Chat = math.divide(C, math.norm(C));
        
        // Let F (Follower) be the vector from followerStart to followerEnd
        const F = math.matrix([this.fourBarConfig.outputFollower.x - this.fourBarConfig.inputFollower.x, 
                             this.fourBarConfig.outputFollower.y - this.fourBarConfig.inputFollower.y]);
        const Fhat = math.divide(F, math.norm(F));

        const x1 = C.get([0]);
        const y1 = C.get([1]);
        const x2 = F.get([0]);
        const y2 = F.get([1]);
        
        // let theta be the angle between C and F
        const cos_theta = math.dot(Chat, Fhat);
        const sin_theta = (x1*y2 - y1*x2) / (math.norm(C) * math.norm(F));

        const translation = [this.fourBarConfig.inputFollower.x - (this.redClosedPoint.x * cos_theta - this.redClosedPoint.y * sin_theta),
            this.fourBarConfig.inputFollower.y - (this.redClosedPoint.x * sin_theta +this.redClosedPoint.y * cos_theta)]

        // Compute transformation from previous to new follower position
        const transform = math.matrix([[cos_theta, -sin_theta, translation[0]], 
            [sin_theta, cos_theta, translation[1]], 
            [0, 0, 1]]);
        
        // Transform previous moving lid vertices to new position
        this.movingLidVertices = this.transformPoints(transform, this.getClosedLidVertices());
        
        // Verify lengths are maintained with 1% tolerance
        const newInputLength = this.distance(this.fourBarConfig.inputGround, this.fourBarConfig.inputFollower);
        const newFollowerLength = this.distance(this.fourBarConfig.inputFollower, this.fourBarConfig.outputFollower);
        const newOutputLength = this.distance(this.fourBarConfig.outputGround, this.fourBarConfig.outputFollower);
        
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
            y: this.height + this.height/3
        };
        
        // Initialize blue points at default positions (different location)
        this.blueOpenPoint = {
            x: this.width - this.gap - this.depth/3,
            y: this.height + this.depth/3
        };
        
        // Calculate closed points from open points
        this.updateRedClosedPoint();
        this.updateBlueClosedPoint();
        
        // Initialize box points at default positions only if they don't exist
        // This allows setBoxPivotPositions to restore them properly
        if (!this.redBoxPoint && !this.blueBoxPoint) {
            const redLen = this.height * 0.1;
            this.redBoxPoint = {
                x: this.centerOfRotation.x,
                y: this.centerOfRotation.y - redLen
            };
            
            const blueLen = this.height * -0.1;
            this.blueBoxPoint = {
                x: this.centerOfRotation.x,
                y: this.centerOfRotation.y - blueLen
            };
        }
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
            },
            dirX: redDirX,
            dirY: redDirY
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
            },
            dirX: blueDirX,
            dirY: blueDirY
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
            redBox: this.fourBarConfig.inputGround,
            redClosed: this.redClosedPoint,  
            blueClosed: this.blueClosedPoint,  
            blueBox: this.fourBarConfig.outputGround,
            follower: {
                start: this.fourBarConfig.inputFollower,
                end: this.fourBarConfig.outputFollower
            }
        };
    }
    
    // Get four-bar configuration without modifying state
    getFourBarConfig() {
        return {
            // Ground points
            inputGround: this.redBoxPoint,
            outputGround: this.blueBoxPoint,
            // Moving points
            inputFollower: this.redClosedPoint,
            outputFollower: this.blueClosedPoint,
            // Link lengths
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
        const range = this.getValidAngleRange();
        this.isAnimating = true;
        this.animationStartTime = Date.now();
        // Always start from closed position (range.start)
        this.animationStartAngle = range.start;
        
        // Initialize four-bar linkage
        this.fourBarConfig = this.getFourBarConfig();
        
        // Initialize moving lid with closed lid vertices
        this.movingLidVertices = this.getClosedLidVertices();
        
        const points = this.getFourBarPoints();
        this.previousFollowerStart = {...points.redClosed};
        this.previousFollowerEnd = {...points.blueClosed};
        
        // Initialize in closed position
        this.updateFourBarPosition(range.start);
    }
    
    stopAnimation() {
        this.isAnimating = false;
    }
    
    updateAnimation() {
        if (!this.isAnimating || !this.fourBarConfig) return;
        
        const range = this.getValidAngleRange();
        const elapsedTime = Date.now() - this.animationStartTime;
        const angularSpeed = Math.PI / 2;  // π/2 radians per second
        const totalAngle = Math.abs(range.end - range.start);
        const cycleDuration = totalAngle / angularSpeed * 1000; // Duration in ms
        
        // Normalize elapsed time to current cycle
        const normalizedTime = elapsedTime % cycleDuration;
        // Calculate progress (0 to 1)
        const progress = normalizedTime / cycleDuration;
        
        // Interpolate between start and end angles
        const newAngle = range.start - (progress * totalAngle);
        
        // Try to update position
        if (!this.updateFourBarPosition(newAngle)) {
            // If update fails, stop animation
            this.isAnimating = false;
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
        
        // Get temporary four-bar config for validation
        const fb = this.getFourBarConfig();
        const prevConfig = { ...fb };
        
        // Check angles at regular intervals
        const numSteps = 360;  // Check every 1 degrees
        const angleStep = (range.start - range.end) / numSteps;
        
        for (let i = 0; i <= numSteps; i++) {
            const angle = range.start - i * angleStep;
            
            // Update input follower position
            const inputFollower = {
                x: fb.inputGround.x + Math.cos(angle) * fb.inputLength,
                y: fb.inputGround.y + Math.sin(angle) * fb.inputLength
            };
            
            // Check if circles intersect at this angle
            const intersections = this.circleIntersection(
                inputFollower,
                fb.outputGround,
                fb.followerLength,
                fb.outputLength
            );
            
            if (intersections.length === 0) {
                return false;
            }
        }
        
        return true;
    }
    
    // Get relative position of box pivots along their constraint lines
    getBoxPivotPositions() {
        if (!this.redBoxPoint || !this.blueBoxPoint || !this.centerOfRotation) {
            return null;
        }
        
        // Calculate relative positions as ratios along the perpendicular lines
        const redDx = this.redBoxPoint.x - this.centerOfRotation.x;
        const redDy = this.redBoxPoint.y - this.centerOfRotation.y;
        const redRatio = Math.sqrt(redDx * redDx + redDy * redDy) / this.height;
        
        const blueDx = this.blueBoxPoint.x - this.centerOfRotation.x;
        const blueDy = this.blueBoxPoint.y - this.centerOfRotation.y;
        const blueRatio = Math.sqrt(blueDx * blueDx + blueDy * blueDy) / this.height;
        
        // Calculate side using cross product of (closed->open) and (closed->boxpoint)
        const redV1 = {
            x: this.redOpenPoint.x - this.redClosedPoint.x,
            y: this.redOpenPoint.y - this.redClosedPoint.y
        };
        const redV2 = {
            x: this.redOpenPoint.x - this.redBoxPoint.x,
            y: this.redOpenPoint.y - this.redBoxPoint.y
        };
        const redSide = Math.sign(redV1.x * redV2.y - redV1.y * redV2.x);
        
        const blueV1 = {
            x: this.blueOpenPoint.x - this.blueClosedPoint.x,
            y: this.blueOpenPoint.y - this.blueClosedPoint.y
        };
        const blueV2 = {
            x: this.blueOpenPoint.x - this.blueBoxPoint.x,
            y: this.blueOpenPoint.y - this.blueBoxPoint.y
        };
        const blueSide = Math.sign(blueV1.x * blueV2.y - blueV1.y * blueV2.x);
        
        return {
            red: { ratio: redRatio, side: redSide },
            blue: { ratio: blueRatio, side: blueSide }
        };
    }
    
    // Set box pivot positions based on relative positions
    setBoxPivotPositions(positions) {
        if (!positions || !this.redConstraintLine || !this.blueConstraintLine) {
            return;
        }
        
        // Set red box point - use perpendicular distance from COR
        const redLen = this.height * positions.red.ratio * positions.red.side;
        this.redBoxPoint = {
            x: this.centerOfRotation.x - this.redConstraintLine.perpX * redLen,
            y: this.centerOfRotation.y - this.redConstraintLine.perpY * redLen
        };
        
        // Set blue box point - use perpendicular distance from COR
        const blueLen = this.height * positions.blue.ratio * positions.blue.side;
        this.blueBoxPoint = {
            x: this.centerOfRotation.x - this.blueConstraintLine.perpX * blueLen,
            y: this.centerOfRotation.y - this.blueConstraintLine.perpY * blueLen
        };
        
        // Re-initialize four-bar linkage with new positions
        this.initializeFourBar();
    }
    
    // Try to preserve a lid pivot point by maintaining its relative position in the lid
    tryPreserveLidPivot(color, prevPoint) {
        const lidVertices = this.getOpenLidVertices();
        
        // If point is still in lid polygon, keep it exactly where it is
        if (this.isPointInPolygon(prevPoint, lidVertices)) {
            if (color === 'red') {
                this.redOpenPoint = prevPoint;
                this.updateRedClosedPoint();
            } else {
                this.blueOpenPoint = prevPoint;
                this.updateBlueClosedPoint();
            }
            return;
        }
        
        // Point is outside lid - calculate its relative position within the lid's bounding box
        const bounds = this.getBoundingBox(lidVertices);
        const relX = (prevPoint.x - bounds.minX) / (bounds.maxX - bounds.minX);
        const relY = (prevPoint.y - bounds.minY) / (bounds.maxY - bounds.minY);
        
        // Apply these relative coordinates to new lid bounds
        const newBounds = this.getBoundingBox(this.getOpenLidVertices());
        const newPoint = {
            x: newBounds.minX + relX * (newBounds.maxX - newBounds.minX),
            y: newBounds.minY + relY * (newBounds.maxY - newBounds.minY)
        };
        
        // If new point is not in lid, find nearest point on lid boundary
        if (!this.isPointInPolygon(newPoint, lidVertices)) {
            const nearestPoint = this.findNearestPointInPolygon(newPoint, lidVertices);
            if (color === 'red') {
                this.redOpenPoint = nearestPoint;
                this.updateRedClosedPoint();
            } else {
                this.blueOpenPoint = nearestPoint;
                this.updateBlueClosedPoint();
            }
            return;
        }
        
        // Use the new point that maintains relative position
        if (color === 'red') {
            this.redOpenPoint = newPoint;
            this.updateRedClosedPoint();
        } else {
            this.blueOpenPoint = newPoint;
            this.updateBlueClosedPoint();
        }
    }
    
    // Get bounding box for a set of points
    getBoundingBox(points) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        
        for (const p of points) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
        
        return { minX, minY, maxX, maxY };
    }
    
    // Find the nearest point inside or on the boundary of a polygon
    findNearestPointInPolygon(point, vertices) {
        let minDist = Infinity;
        let nearestPoint = null;
        
        // Check each edge of the polygon
        for (let i = 0; i < vertices.length; i++) {
            const start = vertices[i];
            const end = vertices[(i + 1) % vertices.length];
            
            // Project point onto line segment
            const projected = this.projectPointOntoLineSegment(point, start, end);
            const dist = this.distance(point, projected);
            
            if (dist < minDist) {
                minDist = dist;
                nearestPoint = projected;
            }
        }
        
        return nearestPoint;
    }
    
    // Get lid pivot positions
    getLidPivotPositions() {
        if (!this.redOpenPoint || !this.blueOpenPoint) return null;
        return {
            redOpen: {...this.redOpenPoint},
            blueOpen: {...this.blueOpenPoint}
        };
    }
    
    // Set lid pivot positions
    setLidPivotPositions(positions) {
        if (!positions) return;
        if (positions.redOpen) {
            this.tryPreserveLidPivot('red', positions.redOpen);
        }
        if (positions.blueOpen) {
            this.tryPreserveLidPivot('blue', positions.blueOpen);
        }
    }
    
    // Get the bounding box for the template, with margin
    // Note: We intentionally only include box pivot points and closed pivot points,
    // NOT the open pivot points, box vertices, or lid vertices. This is because
    // the template only needs to show where to drill holes for the pivot points
    // in their closed position.
    getTemplateBounds() {
        // Get just the four pivot points
        const points = [
            this.redBoxPoint,
            this.blueBoxPoint,
            this.redClosedPoint,
            this.blueClosedPoint
        ];
        
        // Find min/max coordinates
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        for (const p of points) {
            if (!p) continue;  // Skip any null points
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
        
        // Add margin of 25% of the width/height
        const width = maxX - minX;
        const height = maxY - minY;
        const margin = Math.max(width, height) * 0.1;  // Use larger dimension for margin
        
        return {
            minX: minX - margin,
            minY: minY - margin,
            maxX: maxX + margin,
            maxY: maxY + margin,
            width: width + 2 * margin,
            height: height + 2 * margin
        };
    }

    
    // Helper functions for homogeneous coordinates
    toHomogeneous(point) {
        return math.matrix([[point.x], [point.y], [1]]);
    }

    fromHomogeneous(vec) {
        const arr = vec.toArray();
        return {
            x: arr[0][0] / arr[2][0],
            y: arr[1][0] / arr[2][0]
        };
    }

    makeTransform(rotation,translation) {
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        return math.matrix([
            [cos, -sin, translation[0]],
            [sin,  cos, translation[1]],
            [0,    0,   1]
        ]);
    }

    transformPoint(matrix, point) {
        const homogeneous = this.toHomogeneous(point);
        const transformed = math.multiply(matrix, homogeneous);
        return this.fromHomogeneous(transformed);
    }

    transformPoints(matrix, points) {
        return points.map(p => this.transformPoint(matrix, p));
    }
    
    getMovingLidVertices() {
        return this.movingLidVertices;
    }
}
