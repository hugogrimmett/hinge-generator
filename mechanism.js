class Mechanism {
    constructor(solver, boxPivot1, boxPivot2, rod1Length, rod2Length) {
        this.solver = solver;
        this.boxPivot1 = boxPivot1;
        this.boxPivot2 = boxPivot2;
        this.rod1Length = rod1Length;
        this.rod2Length = rod2Length;
        
        // Calculate viewport bounds and scale
        const margin = Math.max(solver.w, solver.h) * 0.25;  // Add 25% margin
        this.viewportBounds = {
            left: Math.min(-margin, boxPivot1.x - margin, boxPivot2.x - margin),
            right: Math.max(solver.w + margin, boxPivot1.x + margin, boxPivot2.x + margin),
            bottom: Math.min(-margin, boxPivot1.y - margin, boxPivot2.y - margin),
            top: Math.max(solver.h + margin, boxPivot1.y + margin, boxPivot2.y + margin)
        };
        
        // Calculate scale to fit viewport in canvas
        const canvas = document.getElementById('canvas');
        const viewportWidth = this.viewportBounds.right - this.viewportBounds.left;
        const viewportHeight = this.viewportBounds.top - this.viewportBounds.bottom;
        
        this.scale = Math.min(
            canvas.width * 0.9 / viewportWidth,
            canvas.height * 0.9 / viewportHeight
        );
        
        // Calculate offset to center viewport
        this.offset = {
            x: canvas.width/2 - (this.viewportBounds.left + viewportWidth/2) * this.scale,
            y: canvas.height/2 + (this.viewportBounds.bottom + viewportHeight/2) * this.scale
        };
    }
}
