# hinge-generator
Generates an 'up and over' hinge configuration for a box with lid. The mechanism is based on a four bar linkage. The objective is to design a hinge that is both functional and pleasing to the user, and then to generate a template that helps the user build such a box.

This particular box and lid are designed such that the lid swings up and over the box and sits on the top, displaying its contents and acting like a display as well as a container.

Project designed by Hugo Grimmett, 2025.

Project plan:
- Visualise a box that is configurable by the user. The box has the following parameters: height (h), width (w), and the lid has depth (d) and angle (alpha). In the open position, there is a gap (g) between the back of the lid and the back of the box.
- Visualise the pivot points of the 4 bar linkage, allowing the user to choose their position given some geometric constraints. 
- Compute, and indicate to the user, whether the chosen configuration meets the requirements of being a valid hinge that meets the required motion. If the hinge is valid, then animate its motion.
- Allow the user to create a template which allows them to test or build this hinge design. The template should be at least a to-scale PDF that indicates (a) the positions of the 4-bar linkage pivot points relative to the box and lid, and (b) the lenghts of the input and output rods.
- As an extension, offer the generation of a file that can be given to a 3D printer to test the hinge mechanism prior to box manufacture.

## Features to Add


- [ ] Better legibility on "open lid" and "closed lid" text
- [ ] Moving lid and box collision detection
- [ ] Clearance between moving lid and box pivot points
- [ ] Animation restarts when scrolling - looks ungraceful
- [ ] Lock the pivot points in proportionally to the lid when changing the box parameters