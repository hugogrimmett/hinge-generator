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
        
        // Link length constraint
        this.constrainLinkLengths = false;
        
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

        // Compute translation vector
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
        
        // Initialize red closed points at default positions
        this.redClosedPoint = {
            x: this.depth/3,
            y: this.height - this.height/3
        };
        
        // Initialize blue closed points at default positions (different location)
        this.blueClosedPoint = {
            x: this.depth/2,
            y: this.height - this.depth/3
        };
        
        // Calculate open points from closed points
        this.updateRedOpenPoint();
        this.updateBlueOpenPoint();
        
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
        const redDx = center.x - this.redClosedPoint.x;
        const redDy = center.y - this.redClosedPoint.y;
        const redLen = Math.sqrt((redDx ** 2) + (redDy ** 2));
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
                x: center.x - redPerpX * this.height,
                y: center.y - redPerpY * this.height
            },
            perpEnd: {
                x: center.x + redPerpX * this.height,
                y: center.y + redPerpY * this.height
            },
            dirX: redDirX,
            dirY: redDirY
        };
        
        // Blue constraint line (similar calculation)
        const blueDx = center.x - this.blueClosedPoint.x;
        const blueDy = center.y - this.blueClosedPoint.y;
        const blueLen = Math.sqrt((blueDx ** 2) + (blueDy ** 2));
        const blueDirX = blueDx / blueLen;
        const blueDirY = blueDy / blueLen;
        
        const bluePerpX = -blueDirY;
        const bluePerpY = blueDirX;
        
        // Store perpendicular direction for box point initialization
        this.blueConstraintLine = {
            perpX: bluePerpX,
            perpY: bluePerpY,
            perpStart: {
                x: center.x - bluePerpX * this.height,
                y: center.y - bluePerpY * this.height
            },
            perpEnd: {
                x: center.x + bluePerpX * this.height,
                y: center.y + bluePerpY * this.height
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
    
    // Update the red open point based on the closed point
    updateRedOpenPoint() {
        const center = this.centerOfRotation;
        if (!center || !this.redClosedPoint) return;
        
        // Get vector from center to closed point
        const dx = this.redClosedPoint.x - center.x;
        const dy = this.redClosedPoint.y - center.y;
        
        // Set open point opposite to closed point
        this.redOpenPoint = {
            x: center.x - dx,
            y: center.y - dy
        };
    }
    
    // Update the blue open point based on the closed point
    updateBlueOpenPoint() {
        const center = this.centerOfRotation;
        if (!center || !this.blueClosedPoint) return;
        
        // Get vector from center to closed point
        const dx = this.blueClosedPoint.x - center.x;
        const dy = this.blueClosedPoint.y - center.y;
        
        // Set open point opposite to closed point
        this.blueOpenPoint = {
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
    moveLidPoint(point, type) {
        // Get the points we're working with based on type: 'redClosed' or 'blueClosed'
        const points = {
            redClosed: {
                self: this.redClosedPoint,
                box: this.redBoxPoint,
                other: this.blueClosedPoint,
                otherBox: this.blueBoxPoint,
                updateOpen: () => this.updateRedOpenPoint(),
                constraintLine: this.redConstraintLine,
                updateBox: (p) => { this.redBoxPoint = p; }
            },
            blueClosed: {
                self: this.blueClosedPoint,
                box: this.blueBoxPoint,
                other: this.redClosedPoint,
                otherBox: this.redBoxPoint,
                updateOpen: () => this.updateBlueOpenPoint(),
                constraintLine: this.blueConstraintLine,
                updateBox: (p) => { this.blueBoxPoint = p; }
            }
        };
        
        const current = points[type];
        if (!current) return;
        
        // Constrain to lid boundaries
        const lidVertices = this.getClosedLidVertices();
        if (!this.isPointInPolygon(point, lidVertices)) {
            return;
        }
        
        // Store current positions and lengths
        const prevSelfLength = this.distance(current.box, current.self);
        const prevBoxPoint = { ...current.box };
        
        // Update point position. The point provided is always the new location of the closed pivot point.
        if (type === 'redClosed') {
            this.redClosedPoint = point;
        } else {
            this.blueClosedPoint = point;
        }

        // Update open point position
        if (type === 'redClosed') {
            this.updateRedOpenPoint();
        } else {
            this.updateBlueOpenPoint();
        }

        // update constraints
        this.updateConstraintLines();
        
        // Project box point onto perpendicular line through COR
        const center = this.centerOfRotation;

        const line = current.constraintLine;
        const dist = this.distance(current.box, center);
        
        // Try both sides of the perpendicular line and keep the one closer to current position
        const sides = [1, -1];
        let bestPoint = null;
        let bestDist = Infinity;
        
        for (const side of sides) {
            const newPoint = {
                x: center.x - line.perpX * dist * side,
                y: center.y - line.perpY * dist * side
            };
            
            const distToOld = this.distance(newPoint, current.box);
            if (distToOld < bestDist) {
                bestDist = distToOld;
                bestPoint = newPoint;
            }
        }
        
        // Update box point to closest valid position
        current.updateBox(bestPoint);
        current.updateOpen();
        this.updateConstraintLines();
        
        // If link lengths should be constrained, update other points to match
        if (this.constrainLinkLengths) {
            const newLength = this.distance(bestPoint, type === 'redClosed' ? this.redClosedPoint : this.blueClosedPoint);
        
            // Try to adjust other points to match new length while staying in bounds
            const result = this.adjustPointWithConstraints(
                current.other,
                current.otherBox,
                newLength,
                lidVertices
            );
            
            if (result) {
                if (type === 'redClosed') {
                    this.blueClosedPoint = result.openPoint;
                    this.blueBoxPoint = result.boxPoint;
                    this.updateBlueOpenPoint();
                } else {
                    this.redClosedPoint = result.openPoint;
                    this.redBoxPoint = result.boxPoint;
                    this.updateRedOpenPoint();
                }
                this.updateConstraintLines();
            } else {
                // If no valid solution found, revert changes
                if (type === 'redClosed') {
                    this.redClosedPoint = point;
                    this.redBoxPoint = prevBoxPoint;
                    this.updateRedOpenPoint();
                } else {
                    this.blueClosedPoint = point;
                    this.blueBoxPoint = prevBoxPoint;
                    this.updateBlueOpenPoint();
                }
                this.updateConstraintLines();
            }
        }
    }
    
    moveRedClosedPoint(point) {
        this.moveLidPoint(point, 'redClosed');
    }
    
    moveBlueClosedPoint(point) {
        this.moveLidPoint(point, 'blueClosed');
    }
    
    moveBoxPoint(point, type) {
        // Get the points we're working with based on type: 'redBox' or 'blueBox'
        const points = {
            redBox: {
                self: this.redBoxPoint,
                closed: this.redClosedPoint,
                other: this.blueClosedPoint,
                otherBox: this.blueBoxPoint,
                updateOpen: () => this.updateRedOpenPoint(),
                constraintLine: this.redConstraintLine,
                updateBox: (p) => { this.redBoxPoint = p; }
            },
            blueBox: {
                self: this.blueBoxPoint,
                closed: this.blueClosedPoint,
                other: this.redClosedPoint,
                otherBox: this.redBoxPoint,
                updateOpen: () => this.updateBlueOpenPoint(),
                constraintLine: this.blueConstraintLine,
                updateBox: (p) => { this.blueBoxPoint = p; }
            }
        };
        
        const current = points[type];
        if (!current || !current.constraintLine) return;
        
        // Store current positions and lengths
        const prevSelfLength = this.distance(current.self, current.closed);
        const prevBoxPoint = { ...current.self };
        
        // Project point onto constraint line
        const line = current.constraintLine;
        const newBoxPoint = this.projectPointOntoLineSegment(point, line.perpStart, line.perpEnd);
        current.updateBox(newBoxPoint);
        current.updateOpen();
        this.updateConstraintLines();
        
        // If link lengths should be constrained, update other points to match
        if (this.constrainLinkLengths) {
            const newLength = this.distance(newBoxPoint, current.closed);
            const lidVertices = this.getOpenLidVertices();
            
            // Try to adjust other points to match new length while staying in bounds
            const result = this.adjustPointWithConstraints(
                current.other,
                current.otherBox,
                newLength,
                lidVertices
            );
            
            if (result) {
                if (type === 'redBox') {
                    this.blueClosedPoint = result.openPoint;
                    this.blueBoxPoint = result.boxPoint;
                    this.updateBlueOpenPoint();
                } else {
                    this.redClosedPoint = result.openPoint;
                    this.redBoxPoint = result.boxPoint;
                    this.updateRedOpenPoint();
                }
                this.updateConstraintLines();
            } else {
                // If no valid solution found, revert changes
                current.updateBox(prevBoxPoint);
                current.updateOpen();
                this.updateConstraintLines();
            }
        }
    }
    
    moveRedBoxPoint(point) {
        this.moveBoxPoint(point, 'redBox');
    }
    
    moveBlueBoxPoint(point) {
        this.moveBoxPoint(point, 'blueBox');    }
    
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
        return {
            redBox: this.redBoxPoint,
            redClosed: this.redClosedPoint,
            redOpen: this.redOpenPoint,
            blueBox: this.blueBoxPoint,
            blueClosed: this.blueClosedPoint,
            blueOpen: this.blueOpenPoint
        };
    }

    // Get shortest distance from point (x0,y0) to line passing through points (x1,y1) and (x2,y2)
    getDistanceFromPointToLine(point, line_a, line_b) {
        const distance = Math.abs((line_b.y - line_a.y) * point.x - (line_b.x - line_a.x) * point.y + (line_b.x * line_a.y - line_a.x * line_b.y)) / Math.sqrt((line_b.y - line_a.y) ** 2 + (line_b.x - line_a.x) ** 2);
        return distance;
    }
    
    getConstraintDotProducts() {
        const center = this.getCenterOfRotation();
        if (!center || !this.redConstraintLine || !this.blueConstraintLine) return null;

        const red_point = this.redConstraintLine.perpEnd;
        const blue_point = this.blueConstraintLine.perpEnd;

        const red_point2 = this.redConstraintLine.perpStart;
        const blue_point2 = this.blueConstraintLine.perpStart;

        const distance_red = this.getDistanceFromPointToLine(
            this.redBoxPoint,
            this.redConstraintLine.perpStart, 
            this.redConstraintLine.perpEnd);
        
        const distance_blue = this.getDistanceFromPointToLine(
            this.blueBoxPoint,
            this.blueConstraintLine.perpStart, 
            this.blueConstraintLine.perpEnd);
        
        return { distance_red, distance_blue, center, red_point, blue_point, red_point2, blue_point2};
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
    
    setBoxPivotPositions(positions) {
        if (!positions || !this.redConstraintLine || !this.blueConstraintLine) {
            return;
        }
        
        const center = this.centerOfRotation;
        
        // Red box point
        const redDist = this.height * positions.red.ratio;
        const redSide = positions.red.side;
        
        // Update box point to stay on constraint line with correct distance and side
        this.redBoxPoint = {
            x: center.x - this.redConstraintLine.perpX * redDist * redSide,
            y: center.y - this.redConstraintLine.perpY * redDist * redSide
        };
        
        // Blue box point
        const blueDist = this.height * positions.blue.ratio;
        const blueSide = positions.blue.side;
        
        // Update box point to stay on constraint line with correct distance and side
        this.blueBoxPoint = {
            x: center.x - this.blueConstraintLine.perpX * blueDist * blueSide,
            y: center.y - this.blueConstraintLine.perpY * blueDist * blueSide
        };
        
        // Re-initialize four-bar linkage with new positions
        this.initializeFourBar();
    }
    
    // Try to preserve a lid pivot point by maintaining its relative position in the lid
    tryPreserveLidPivot(color, prevPoint) {
        const lidVertices = this.getClosedLidVertices();
        
        // If point is still in lid polygon, keep it exactly where it is
        if (this.isPointInPolygon(prevPoint, lidVertices)) {
            if (color === 'red') {
                this.redClosedPoint = prevPoint;
                this.updateRedOpenPoint();
            } else {
                this.blueClosedPoint = prevPoint;
                this.updateBlueOpenPoint();
            }
            return;
        }
        
        // Point is outside lid - calculate its relative position within the lid's bounding box
        const bounds = this.getBoundingBox(lidVertices);
        const relX = (prevPoint.x - bounds.minX) / (bounds.maxX - bounds.minX);
        const relY = (prevPoint.y - bounds.minY) / (bounds.maxY - bounds.minY);
        
        // Apply these relative coordinates to new lid bounds
        const newBounds = this.getBoundingBox(this.getClosedLidVertices());
        const newPoint = {
            x: newBounds.minX + relX * (newBounds.maxX - newBounds.minX),
            y: newBounds.minY + relY * (newBounds.maxY - newBounds.minY)
        };
        
        // If new point is not in lid, find nearest point on lid boundary
        if (!this.isPointInPolygon(newPoint, lidVertices)) {
            const nearestPoint = this.findNearestPointInPolygon(newPoint, lidVertices);
            if (color === 'red') {
                this.redClosedPoint = nearestPoint;
                this.updateRedOpenPoint();
            } else {
                this.blueClosedPoint = nearestPoint;
                this.updateBlueOpenPoint();
            }
            return;
        }
        
        // Use the new point that maintains relative position
        if (color === 'red') {
            this.redClosedPoint = newPoint;
            this.updateRedOpenPoint();
        } else {
            this.blueClosedPoint = newPoint;
            this.updateBlueOpenPoint();
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
        if (!this.redClosedPoint || !this.blueClosedPoint) return null;
        return {
            redClosed: {...this.redClosedPoint},
            blueClosed: {...this.blueClosedPoint}
        };
    }
    
    // Set lid pivot positions
    setLidPivotPositions(positions) {
        if (!positions) return;
        if (positions.redClosed) {
            this.tryPreserveLidPivot('red', positions.redClosed);
        }
        if (positions.blueClosed) {
            this.tryPreserveLidPivot('blue', positions.blueClosed);
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
    
    // Helper to find a valid point on a circle that lies within a polygon
    findValidPointOnCircle(center, radius, polygon, preferredAngle = null) {
        // If preferred angle is provided, try it first
        if (preferredAngle !== null) {
            const point = {
                x: center.x + radius * Math.cos(preferredAngle),
                y: center.y + radius * Math.sin(preferredAngle)
            };
            if (this.isPointInPolygon(point, polygon)) {
                return point;
            }
        }
        
        // Try angles in increasing steps from the preferred angle
        const angleStep = Math.PI / 180; // 1 degree steps
        const maxSteps = 360; // Full circle
        
        const startAngle = preferredAngle || Math.atan2(polygon[0].y - center.y, polygon[0].x - center.x);
        
        for (let i = 1; i <= maxSteps; i++) {
            // Try both clockwise and counterclockwise from the start angle
            const angles = [
                startAngle + i * angleStep,
                startAngle - i * angleStep
            ];
            
            for (const angle of angles) {
                const point = {
                    x: center.x + radius * Math.cos(angle),
                    y: center.y + radius * Math.sin(angle)
                };
                
                if (this.isPointInPolygon(point, polygon)) {
                    return point;
                }
            }
        }
        
        return null; // No valid point found
    }
    
    // Helper to adjust a point to maintain link length and stay within bounds
    adjustPointWithConstraints(closedPoint, boxPoint, targetLength, lidVertices) {
        const center = this.centerOfRotation;
        const constraintLine = boxPoint === this.redBoxPoint ? this.redConstraintLine : this.blueConstraintLine;
        
        // First try to maintain current box point position
        const angle = Math.atan2(closedPoint.y - boxPoint.y, closedPoint.x - boxPoint.x);
        const validClosedPoint = this.findValidPointOnCircle(boxPoint, targetLength, lidVertices, angle);
        
        if (validClosedPoint) {
            return {
                openPoint: validClosedPoint,
                boxPoint: boxPoint
            };
        }
        
        // If that fails, try different positions along the constraint line
        const currentDist = this.distance(boxPoint, center);
        
        // Try different distances from COR along constraint line
        const stepSize = this.height / 50; // Small steps relative to box height
        const maxSteps = 20; // Don't try too far
        
        for (let i = 0; i <= maxSteps; i++) {
            // Try both directions from current position
            const distances = [
                currentDist + i * stepSize,
                Math.max(0, currentDist - i * stepSize)
            ];
            
            for (const dist of distances) {
                // Try both sides of constraint line
                const sides = [1, -1];
                
                for (const side of sides) {
                    // Ensure box point stays on perpendicular line through COR
                    const newBoxPoint = {
                        x: center.x - constraintLine.perpX * dist * side,
                        y: center.y - constraintLine.perpY * dist * side
                    };
                    
                    // Try to find valid closed point with this box point
                    const validClosedPoint = this.findValidPointOnCircle(newBoxPoint, targetLength, lidVertices, angle);
                    
                    if (validClosedPoint) {
                        return {
                            openPoint: validClosedPoint,
                            boxPoint: newBoxPoint
                        };
                    }
                }
            }
        }
        
        // If all else fails, return null to indicate no valid solution
        return null;
    }
}
