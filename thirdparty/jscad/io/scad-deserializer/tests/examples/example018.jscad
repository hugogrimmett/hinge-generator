function main(){

return CSG.cube({center: [0,0,0],radius: [30,30,30], resolution: 16}).translate([-150,0,0]).union([CSG.cylinder({start: [0,0,-25], end: [0,0,25],radiusStart: 30, radiusEnd: 30, resolution: 30}).translate([-50,0,0])]).union([CSG.cube({center: [0,0,0],radius: [22.5,22.5,22.5], resolution: 16}).union([CSG.cube({center: [0,0,0],radius: [25,25,25], resolution: 16}).rotateX(45).rotateY(0).rotateZ(0),CSG.cube({center: [0,0,0],radius: [25,25,25], resolution: 16}).rotateX(0).rotateY(45).rotateZ(0),CSG.cube({center: [0,0,0],radius: [25,25,25], resolution: 16}).rotateX(0).rotateY(0).rotateZ(45)]).translate([50,0,0])]).union([CSG.sphere({center: [0,0,0], radius: 30, resolution: 30}).translate([150,0,0])]).translate([0,-150,0]).union([CSG.cylinder({start: [0,0,-25], end: [0,0,25],radiusStart: 30, radiusEnd: 30, resolution: 30}).translate([-150,0,0]).union([CSG.cube({center: [0,0,0],radius: [22.5,22.5,22.5], resolution: 16}).union([CSG.cube({center: [0,0,0],radius: [25,25,25], resolution: 16}).rotateX(45).rotateY(0).rotateZ(0),CSG.cube({center: [0,0,0],radius: [25,25,25], resolution: 16}).rotateX(0).rotateY(45).rotateZ(0),CSG.cube({center: [0,0,0],radius: [25,25,25], resolution: 16}).rotateX(0).rotateY(0).rotateZ(45)]).translate([-50,0,0])]).union([CSG.sphere({center: [0,0,0], radius: 30, resolution: 30}).translate([50,0,0])]).union([CSG.cube({center: [0,0,0],radius: [30,30,30], resolution: 16}).translate([150,0,0])]).translate([0,-50,0])]).union([CSG.cube({center: [0,0,0],radius: [22.5,22.5,22.5], resolution: 16}).union([CSG.cube({center: [0,0,0],radius: [25,25,25], resolution: 16}).rotateX(45).rotateY(0).rotateZ(0),CSG.cube({center: [0,0,0],radius: [25,25,25], resolution: 16}).rotateX(0).rotateY(45).rotateZ(0),CSG.cube({center: [0,0,0],radius: [25,25,25], resolution: 16}).rotateX(0).rotateY(0).rotateZ(45)]).translate([-150,0,0]).union([CSG.sphere({center: [0,0,0], radius: 30, resolution: 30}).translate([-50,0,0])]).union([CSG.cube({center: [0,0,0],radius: [30,30,30], resolution: 16}).translate([50,0,0])]).union([CSG.cylinder({start: [0,0,-25], end: [0,0,25],radiusStart: 30, radiusEnd: 30, resolution: 30}).translate([150,0,0])]).translate([0,50,0])]).union([CSG.sphere({center: [0,0,0], radius: 30, resolution: 30}).translate([-150,0,0]).union([CSG.cube({center: [0,0,0],radius: [30,30,30], resolution: 16}).translate([-50,0,0])]).union([CSG.cylinder({start: [0,0,-25], end: [0,0,25],radiusStart: 30, radiusEnd: 30, resolution: 30}).translate([50,0,0])]).union([CSG.cube({center: [0,0,0],radius: [22.5,22.5,22.5], resolution: 16}).union([CSG.cube({center: [0,0,0],radius: [25,25,25], resolution: 16}).rotateX(45).rotateY(0).rotateZ(0),CSG.cube({center: [0,0,0],radius: [25,25,25], resolution: 16}).rotateX(0).rotateY(45).rotateZ(0),CSG.cube({center: [0,0,0],radius: [25,25,25], resolution: 16}).rotateX(0).rotateY(0).rotateZ(45)]).translate([150,0,0])]).translate([0,150,0])]);
};