// Global variables for mechanism state
let mechanism = null;
let animation = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Set up parameter synchronization
    ['height', 'width', 'depth', 'alpha', 'gap'].forEach(param => {
        const slider = document.getElementById(param);
        const number = document.getElementById(param + 'Num');
        const value = document.getElementById(param + 'Value');
        
        slider.addEventListener('input', () => {
            number.value = slider.value;
            value.textContent = slider.value;
            updateMechanism();
        });
        
        number.addEventListener('input', () => {
            if (number.value >= number.min && number.value <= number.max) {
                slider.value = number.value;
                value.textContent = number.value;
                updateMechanism();
            }
        });
    });

    // Set up copy button
    document.getElementById('copyDebug').addEventListener('click', () => {
        const debugText = document.getElementById('debugContent').textContent;
        navigator.clipboard.writeText(debugText).then(() => {
            const btn = document.getElementById('copyDebug');
            btn.textContent = '✓ Copied!';
            setTimeout(() => btn.textContent = '📋 Copy', 2000);
        });
    });

    // Handle animation controls
    document.getElementById('animateBtn').addEventListener('click', () => {
        if (animation) {
            animation.startAnimation();
        }
    });

    document.getElementById('stopBtn').addEventListener('click', () => {
        if (animation) {
            animation.stopAnimation();
        }
    });

    // Handle view mode changes
    const viewModeInputs = document.querySelectorAll('input[name="viewMode"]');
    viewModeInputs.forEach(input => {
        input.addEventListener('change', () => {
            if (animation) {
                animation.currentAngle = input.value === 'open' ? Math.PI : 0;
                animation.draw();
            }
        });
    });

    // Initial mechanism update
    updateMechanism();
});

function updateDebugInfo(solver, solution) {
    const params = {
        height: parseFloat(document.getElementById('height').value),
        width: parseFloat(document.getElementById('width').value),
        depth: parseFloat(document.getElementById('depth').value),
        alpha: parseFloat(document.getElementById('alpha').value),
        gap: parseFloat(document.getElementById('gap').value)
    };
    
    let debugText = '';
    
    // Add input parameters
    debugText += '=== Input Parameters ===\n';
    debugText += `height: ${params.height}\n`;
    debugText += `width: ${params.width}\n`;
    debugText += `depth: ${params.depth}\n`;
    debugText += `alpha: ${params.alpha}\n`;
    debugText += `gap: ${params.gap}\n\n`;
    
    // Add solver state
    debugText += '=== Solver State ===\n';
    debugText += `Critical angle: ${(solver.criticalAngle * 180 / Math.PI).toFixed(2)}°\n`;
    debugText += `Current case: ${solver.alphaRad <= solver.criticalAngle ? 'Triangle' : 'Quadrilateral'}\n\n`;
    
    // Add solution details
    if (solution.error) {
        debugText += '❌ ERROR: ' + solution.error + '\n\n';
        if (solution.details) {
            debugText += 'Details:\n';
            for (const [key, value] of Object.entries(solution.details)) {
                if (key === 'suggestions' && Array.isArray(value)) {
                    debugText += `${key}:\n${value.map(s => '- ' + s).join('\n')}\n`;
                } else {
                    debugText += `${key}: ${value}\n`;
                }
            }
        }
    } else {
        debugText += '✅ Solution found!\n\n';
        debugText += 'Box Pivots:\n';
        debugText += `1: (${solution.boxPivot1.x.toFixed(2)}, ${solution.boxPivot1.y.toFixed(2)})\n`;
        debugText += `2: (${solution.boxPivot2.x.toFixed(2)}, ${solution.boxPivot2.y.toFixed(2)})\n\n`;
        debugText += `Rod lengths: ${solution.rod1Length.toFixed(2)}, ${solution.rod2Length.toFixed(2)}\n`;
    }
    
    document.getElementById('debugContent').textContent = debugText;
}

function updateMechanism() {
    const params = {
        height: parseFloat(document.getElementById('height').value),
        width: parseFloat(document.getElementById('width').value),
        depth: parseFloat(document.getElementById('depth').value),
        alpha: parseFloat(document.getElementById('alpha').value),
        gap: parseFloat(document.getElementById('gap').value)
    };
    
    // Default to true if checkbox not found
    const equalLengths = document.getElementById('preferEqualLengths')?.checked ?? true;
    
    const solver = new FourBarSolver(
        params.height,
        params.width,
        params.depth,
        params.alpha,
        params.gap,
        equalLengths
    );
    
    const solution = solver.solve();
    updateDebugInfo(solver, solution);
    
    if (!animation) {
        const canvas = document.getElementById('canvas');
        animation = new MechanismAnimation(canvas, null, solver);
    }
    
    if (solution.isValid) {
        mechanism = new Mechanism(
            solver,
            solution.boxPivot1,
            solution.boxPivot2,
            solution.rod1Length,
            solution.rod2Length
        );
        animation.mechanism = mechanism;
    } else {
        animation.mechanism = null;
    }
    
    animation.solver = solver;
    animation.draw();
}

class MechanismAnimation {
    constructor(canvas, mechanism, solver) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.mechanism = mechanism;
        this.solver = solver;
        
        // Animation state
        this.isAnimating = false;
        this.currentAngle = 0;  // Current angle of first rod
        this.animationDirection = 1;  // 1 for opening, -1 for closing
    }
    
    // Draw mechanism at current state
    draw() {
        console.log("Drawing...");
        console.log("Canvas dimensions:", this.canvas.width, this.canvas.height);
        console.log("Mechanism:", this.mechanism);
        console.log("Solver:", this.solver);
        
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw canvas bounds for debugging
        ctx.strokeStyle = '#f00';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw center point
        ctx.fillStyle = '#f00';
        ctx.beginPath();
        ctx.arc(this.canvas.width/2, this.canvas.height/2, 5, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.save();
        
        // Draw untransformed coordinate system
        ctx.strokeStyle = '#0f0';
        ctx.beginPath();
        ctx.moveTo(0, this.canvas.height/2);
        ctx.lineTo(this.canvas.width, this.canvas.height/2);
        ctx.moveTo(this.canvas.width/2, 0);
        ctx.lineTo(this.canvas.width/2, this.canvas.height);
        ctx.stroke();
        
        // Even if we don't have a valid mechanism, create a temporary one for viewport
        const tempMechanism = this.mechanism || new Mechanism(
            this.solver,
            {x: 0, y: this.solver.h * 0.8},  // Default box pivot 1
            {x: this.solver.d, y: this.solver.h * 0.8},  // Default box pivot 2
            this.solver.d,  // Default rod 1 length
            this.solver.d   // Default rod 2 length
        );
        
        // Use mechanism's transform
        ctx.translate(tempMechanism.offset.x, tempMechanism.offset.y);
        ctx.scale(tempMechanism.scale, -tempMechanism.scale);  // Flip y-axis
        
        // Draw transformed coordinate system
        ctx.strokeStyle = '#00f';
        ctx.lineWidth = 1 / tempMechanism.scale;
        ctx.beginPath();
        ctx.moveTo(-100, 0);
        ctx.lineTo(100, 0);
        ctx.moveTo(0, -100);
        ctx.lineTo(0, 100);
        ctx.stroke();
        
        // Draw viewport bounds
        ctx.strokeStyle = '#f0f';
        ctx.strokeRect(
            tempMechanism.viewportBounds.left,
            tempMechanism.viewportBounds.bottom,
            tempMechanism.viewportBounds.right - tempMechanism.viewportBounds.left,
            tempMechanism.viewportBounds.top - tempMechanism.viewportBounds.bottom
        );
        
        // Draw test square at origin
        ctx.strokeStyle = '#000';
        ctx.strokeRect(-10, -10, 20, 20);
        
        // Set line width relative to scale
        ctx.lineWidth = 1 / tempMechanism.scale;
        
        // Always draw box and lid
        this.drawBox();
        this.drawLid();  // Now draws lid even without valid mechanism
        
        if (this.mechanism) {
            // Draw linkage only if we have a valid mechanism
            this.drawLinkage();
        } else {
            // Draw a message indicating no valid solution
            ctx.restore();
            ctx.font = '20px Arial';
            ctx.fillStyle = '#f00';
            ctx.textAlign = 'center';
            ctx.fillText('No valid mechanism found - adjust parameters', this.canvas.width/2, this.canvas.height/2 + 30);
            return;
        }
        
        ctx.restore();
        
        // Draw debug text
        ctx.font = '12px monospace';
        ctx.fillStyle = '#000';
        ctx.textAlign = 'left';
        
        // Always show solver parameters
        ctx.fillText(`Height: ${this.solver.h.toFixed(1)}`, 10, 20);
        ctx.fillText(`Width: ${this.solver.w.toFixed(1)}`, 10, 40);
        ctx.fillText(`Depth: ${this.solver.d.toFixed(1)}`, 10, 60);
        ctx.fillText(`Alpha: ${this.solver.alpha.toFixed(1)}°`, 10, 80);
        ctx.fillText(`Gap: ${this.solver.g.toFixed(1)}`, 10, 100);
        ctx.fillText(`Position: ${(this.currentAngle * 100 / Math.PI).toFixed(1)}%`, 10, 120);
        
        if (this.mechanism) {
            // Show mechanism details if available
            ctx.fillText(`Scale: ${this.mechanism.scale.toFixed(2)}`, 200, 20);
            ctx.fillText(`Rod 1: ${this.mechanism.rod1Length.toFixed(1)}`, 200, 40);
            ctx.fillText(`Rod 2: ${this.mechanism.rod2Length.toFixed(1)}`, 200, 60);
            ctx.fillText(`Box Pivot 1: (${this.mechanism.boxPivot1.x.toFixed(1)}, ${this.mechanism.boxPivot1.y.toFixed(1)})`, 200, 80);
            ctx.fillText(`Box Pivot 2: (${this.mechanism.boxPivot2.x.toFixed(1)}, ${this.mechanism.boxPivot2.y.toFixed(1)})`, 200, 100);
        }
    }
    
    // Draw box outline
    drawBox() {
        if (!this.solver) return;
        
        const vertices = this.solver.getBoxVertices();
        const ctx = this.ctx;
        
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        
        ctx.strokeStyle = '#000';
        ctx.stroke();
    }
    
    // Draw lid in current position
    drawLid() {
        if (!this.solver) return;
        
        // Get lid vertices directly from solver based on position
        const position = this.currentAngle * 100 / Math.PI;  // Convert angle to position (0-100)
        const vertices = this.solver.getLidVertices(position);
        const ctx = this.ctx;
        
        // Draw lid outline
        ctx.strokeStyle = this.mechanism ? '#000' : '#888';  // Gray if no valid mechanism
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        
        // Draw lid pivots if we have a valid mechanism
        if (this.mechanism) {
            const lidPivots = this.solver.calculateLidPivots(
                this.mechanism.boxPivot1,
                this.mechanism.boxPivot2,
                this.mechanism.rod1Length,
                this.mechanism.rod2Length,
                this.currentAngle
            );
            
            if (lidPivots) {
                ctx.fillStyle = '#f00';
                const pivotRadius = 2 / this.mechanism.scale;
                
                ctx.beginPath();
                ctx.arc(lidPivots.p1.x, lidPivots.p1.y, pivotRadius, 0, 2 * Math.PI);
                ctx.fill();
                
                ctx.beginPath();
                ctx.arc(lidPivots.p2.x, lidPivots.p2.y, pivotRadius, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }
    
    // Draw linkage (rods)
    drawLinkage() {
        if (!this.solver || !this.mechanism) return;
        
        const lidPivots = this.solver.calculateLidPivots(
            this.mechanism.boxPivot1,
            this.mechanism.boxPivot2,
            this.mechanism.rod1Length,
            this.mechanism.rod2Length,
            this.currentAngle
        );
        
        if (!lidPivots) return;  // Skip if no valid configuration
        
        const ctx = this.ctx;
        ctx.strokeStyle = '#00f';
        ctx.lineWidth = 0.5 / this.mechanism.scale;
        
        // Draw first rod
        ctx.beginPath();
        ctx.moveTo(this.mechanism.boxPivot1.x, this.mechanism.boxPivot1.y);
        ctx.lineTo(lidPivots.p1.x, lidPivots.p1.y);
        ctx.stroke();
        
        // Draw second rod
        ctx.beginPath();
        ctx.moveTo(this.mechanism.boxPivot2.x, this.mechanism.boxPivot2.y);
        ctx.lineTo(lidPivots.p2.x, lidPivots.p2.y);
        ctx.stroke();
        
        // Draw pivot points
        ctx.fillStyle = '#f00';
        const pivotRadius = 2 / this.mechanism.scale;
        
        // Box pivots
        ctx.beginPath();
        ctx.arc(this.mechanism.boxPivot1.x, this.mechanism.boxPivot1.y, pivotRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(this.mechanism.boxPivot2.x, this.mechanism.boxPivot2.y, pivotRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        // Lid pivots
        ctx.beginPath();
        ctx.arc(lidPivots.p1.x, lidPivots.p1.y, pivotRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(lidPivots.p2.x, lidPivots.p2.y, pivotRadius, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    // Start animation
    startAnimation() {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.animate();
    }
    
    // Stop animation
    stopAnimation() {
        this.isAnimating = false;
    }
    
    // Animation loop
    animate() {
        if (!this.isAnimating) return;
        
        // Update angle
        this.currentAngle += this.animationDirection * 0.05;
        
        // Check bounds and reverse direction if needed
        if (this.currentAngle >= Math.PI) {
            this.currentAngle = Math.PI;
            this.animationDirection = -1;
        } else if (this.currentAngle <= 0) {
            this.currentAngle = 0;
            this.animationDirection = 1;
        }
        
        // Draw current state
        this.draw();
        
        // Request next frame
        requestAnimationFrame(() => this.animate());
    }
}
