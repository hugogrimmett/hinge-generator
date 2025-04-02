// STL Generator for Hinge Box using JSCAD
class STLGenerator {
    constructor(boxGeometry) {
        // Get JSCAD modules from the global jscadModeling object
        this.modeling = jscadModeling;
        
        // Store geometry
        this.geometry = boxGeometry;
        
        // Constants
        this.thickness = 3; // 3mm thickness
        this.pinDiameter = 4; // 4mm pin diameter
        this.holeDiameter = 4.5; // 4.5mm hole diameter
        this.armWidth = 4; // 4mm wide connecting arms
    }

    async generateZip() {
        const zip = new JSZip();
        
        try {
            // Generate all STLs
            const boxStl = await this.generateBoxSTL();
            const lidStl = await this.generateLidSTL();
            const linkRedStl = await this.generateLinkRedSTL();
            const linkBlueStl = await this.generateLinkBlueSTL();
            
            // Add to zip
            zip.file("box.stl", boxStl);
            zip.file("lid.stl", lidStl);
            zip.file("linkRed.stl", linkRedStl);
            zip.file("linkBlue.stl", linkBlueStl);
            
            // Generate and save zip
            const content = await zip.generateAsync({type: "blob"});
            saveAs(content, "hinge-box.zip");
        } catch (error) {
            console.error("Error generating STL files:", error);
            throw error;
        }
    }

    async generateBoxSTL() {
        const { primitives, transforms, booleans, extrusions, geometries } = this.modeling;
        
        // Get box vertices and create 2D shape
        const vertices = this.geometry.getBoxVertices();
        const points = vertices.map(v => [v.x, v.y]);
        const polygon = geometries.geom2.fromPoints(points);
        
        // Extrude to thickness
        let box = extrusions.extrudeLinear({height: this.thickness}, polygon);
        
        // Add pins and connecting arms where needed
        const center = this.geometry.getCenterOfRotation();
        
        // Add red box point pin
        const redBoxPoint = this.geometry.redBoxPoint;
        const redPin = primitives.cylinder({
            height: this.thickness,
            radius: this.pinDiameter / 2,
            center: [redBoxPoint.x, redBoxPoint.y, this.thickness / 2]
        });
        
        // Check if red point is outside box
        if (!this.isPointInPolygon(redBoxPoint, vertices)) {
            // Create connecting arm from center to red point
            const redArm = this.createConnectingArm(center, redBoxPoint);
            box = booleans.union(box, redArm);
        }
        
        // Add blue box point pin
        const blueBoxPoint = this.geometry.blueBoxPoint;
        const bluePin = primitives.cylinder({
            height: this.thickness,
            radius: this.pinDiameter / 2,
            center: [blueBoxPoint.x, blueBoxPoint.y, this.thickness / 2]
        });
        
        // Check if blue point is outside box
        if (!this.isPointInPolygon(blueBoxPoint, vertices)) {
            // Create connecting arm from center to blue point
            const blueArm = this.createConnectingArm(center, blueBoxPoint);
            box = booleans.union(box, blueArm);
        }
        
        // Add pins to box
        box = booleans.union(box, redPin, bluePin);
        
        // Convert to STL binary data
        const stlData = this.serializeToStl(box);
        return new Blob([stlData], {type: 'model/stl'});
    }

    createConnectingArm(from, to) {
        const { primitives, transforms, extrusions } = this.modeling;
        
        // Calculate direction vector
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        // Create rectangle for arm
        const rect = primitives.rectangle({
            size: [length, this.armWidth],
            center: [length / 2, 0]
        });
        
        // Extrude and rotate to correct position
        let arm = extrusions.extrudeLinear({height: this.thickness}, rect);
        arm = transforms.rotateZ(angle, arm);
        arm = transforms.translate([from.x, from.y, 0], arm);
        
        return arm;
    }

    isPointInPolygon(point, vertices) {
        // Simple point-in-polygon test
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

    async generateLidSTL() {
        const { primitives, transforms, booleans, extrusions, geometries } = this.modeling;
        
        // Get lid vertices and create 2D shape
        const vertices = this.geometry.getClosedLidVertices();
        const points = vertices.map(v => [v.x, v.y]);
        const polygon = geometries.geom2.fromPoints(points);
        
        // Extrude to thickness
        let lid = extrusions.extrudeLinear({height: this.thickness}, polygon);
        
        // Add red lid point pin
        const redLidPoint = this.geometry.redOpenPoint;
        const redPin = primitives.cylinder({
            height: this.thickness,
            radius: this.pinDiameter / 2,
            center: [redLidPoint.x, redLidPoint.y, this.thickness / 2]
        });
        
        // Add blue lid point pin
        const blueLidPoint = this.geometry.blueOpenPoint;
        const bluePin = primitives.cylinder({
            height: this.thickness,
            radius: this.pinDiameter / 2,
            center: [blueLidPoint.x, blueLidPoint.y, this.thickness / 2]
        });
        
        // Add pins to lid
        lid = booleans.union(lid, redPin, bluePin);
        
        // Convert to STL binary data
        const stlData = this.serializeToStl(lid);
        return new Blob([stlData], {type: 'model/stl'});
    }

    async generateLinkRedSTL() {
        const { primitives, transforms, booleans, extrusions, geometries } = this.modeling;
        
        // Get points for the red link
        const boxPoint = this.geometry.redBoxPoint;
        const lidPoint = this.geometry.redOpenPoint;
        
        // Calculate link dimensions
        const dx = lidPoint.x - boxPoint.x;
        const dy = lidPoint.y - boxPoint.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        // Create link body
        const linkWidth = this.armWidth;
        const rect = primitives.rectangle({
            size: [length, linkWidth],
            center: [length / 2, 0]
        });
        
        // Create holes for pins
        const boxHole = primitives.circle({
            radius: this.holeDiameter / 2,
            center: [0, 0]
        });
        
        const lidHole = primitives.circle({
            radius: this.holeDiameter / 2,
            center: [length, 0]
        });
        
        // Subtract holes from link
        const linkWithHoles = booleans.subtract(rect, boxHole, lidHole);
        
        // Extrude to thickness
        let link = extrusions.extrudeLinear({height: this.thickness}, linkWithHoles);
        
        // Rotate and position link
        link = transforms.rotateZ(angle, link);
        link = transforms.translate([boxPoint.x, boxPoint.y, 0], link);
        
        // Convert to STL binary data
        const stlData = this.serializeToStl(link);
        return new Blob([stlData], {type: 'model/stl'});
    }

    async generateLinkBlueSTL() {
        const { primitives, transforms, booleans, extrusions, geometries } = this.modeling;
        
        // Get points for the blue link
        const boxPoint = this.geometry.blueBoxPoint;
        const lidPoint = this.geometry.blueOpenPoint;
        
        // Calculate link dimensions
        const dx = lidPoint.x - boxPoint.x;
        const dy = lidPoint.y - boxPoint.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        // Create link body
        const linkWidth = this.armWidth;
        const rect = primitives.rectangle({
            size: [length, linkWidth],
            center: [length / 2, 0]
        });
        
        // Create holes for pins
        const boxHole = primitives.circle({
            radius: this.holeDiameter / 2,
            center: [0, 0]
        });
        
        const lidHole = primitives.circle({
            radius: this.holeDiameter / 2,
            center: [length, 0]
        });
        
        // Subtract holes from link
        const linkWithHoles = booleans.subtract(rect, boxHole, lidHole);
        
        // Extrude to thickness
        let link = extrusions.extrudeLinear({height: this.thickness}, linkWithHoles);
        
        // Rotate and position link
        link = transforms.rotateZ(angle, link);
        link = transforms.translate([boxPoint.x, boxPoint.y, 0], link);
        
        // Convert to STL binary data
        const stlData = this.serializeToStl(link);
        return new Blob([stlData], {type: 'model/stl'});
    }
    
    // Custom STL serializer based on JSCAD's STL serializer
    serializeToStl(object) {
        const { geometries } = this.modeling;
        
        // first check if the host is little-endian:
        const buffer = new ArrayBuffer(4);
        const int32buffer = new Int32Array(buffer, 0, 1);
        const int8buffer = new Int8Array(buffer, 0, 4);
        int32buffer[0] = 0x11223344;
        if (int8buffer[0] !== 0x44) {
            throw new Error('Binary STL output is currently only supported on little-endian (Intel) processors');
        }
        
        // Get all polygons from the object
        const polygons = geometries.geom3.toPolygons(object);
        
        // Count triangles
        let numtriangles = 0;
        polygons.forEach((polygon) => {
            const numvertices = polygon.vertices.length;
            const thisnumtriangles = (numvertices >= 3) ? numvertices - 2 : 0;
            numtriangles += thisnumtriangles;
        });
        
        // Create header (80 bytes)
        const headerarray = new Uint8Array(80);
        for (let i = 0; i < 80; i++) {
            headerarray[i] = 65;
        }
        
        // Create triangle count (4 bytes)
        const ar1 = new Uint32Array(1);
        ar1[0] = numtriangles;
        
        // Create buffer for all triangles
        const allTrianglesBuffer = new ArrayBuffer(50 * numtriangles);
        const allTrianglesBufferAsInt8 = new Int8Array(allTrianglesBuffer);
        
        // Create temporary buffer for each triangle
        const triangleBuffer = new ArrayBuffer(50);
        const triangleBufferAsInt8 = new Int8Array(triangleBuffer);
        const triangleFloat32array = new Float32Array(triangleBuffer, 0, 12);
        const triangleUint16array = new Uint16Array(triangleBuffer, 48, 1);
        
        let byteoffset = 0;
        
        // Process all polygons and convert to triangles
        polygons.forEach((polygon) => {
            const vertices = polygon.vertices;
            const numvertices = vertices.length;
            const plane = geometries.poly3.plane(polygon);
            
            // Triangulate polygon
            for (let i = 0; i < numvertices - 2; i++) {
                // Normal vector
                triangleFloat32array[0] = plane[0];
                triangleFloat32array[1] = plane[1];
                triangleFloat32array[2] = plane[2];
                
                let arindex = 3;
                for (let v = 0; v < 3; v++) {
                    const vv = v + ((v > 0) ? i : 0);
                    const vertex = vertices[vv];
                    triangleFloat32array[arindex++] = vertex[0];
                    triangleFloat32array[arindex++] = vertex[1];
                    triangleFloat32array[arindex++] = vertex[2];
                }
                
                triangleUint16array[0] = 0;
                
                // Copy triangle to main buffer
                allTrianglesBufferAsInt8.set(triangleBufferAsInt8, byteoffset);
                byteoffset += 50;
            }
        });
        
        // Combine all buffers into one
        const headerBuffer = headerarray.buffer;
        const triangleCountBuffer = ar1.buffer;
        
        // Create a new buffer with all data
        const totalBytes = headerBuffer.byteLength + triangleCountBuffer.byteLength + allTrianglesBuffer.byteLength;
        const finalBuffer = new ArrayBuffer(totalBytes);
        const finalBufferView = new Uint8Array(finalBuffer);
        
        // Copy data into final buffer
        let offset = 0;
        finalBufferView.set(new Uint8Array(headerBuffer), offset);
        offset += headerBuffer.byteLength;
        finalBufferView.set(new Uint8Array(triangleCountBuffer), offset);
        offset += triangleCountBuffer.byteLength;
        finalBufferView.set(new Uint8Array(allTrianglesBuffer), offset);
        
        return finalBuffer;
    }
}
