// OpenSCAD parametric design
$fn = 100; // Resolution
wall_thickness = 2;
box_width = 50;
box_height = 30;
box_depth = 40;

module printable_box() {
    difference() {
        cube([box_width, box_depth, box_height]);
        translate([wall_thickness, wall_thickness, wall_thickness])
            cube([box_width-2*wall_thickness, 
                  box_depth-2*wall_thickness, 
                  box_height]);
    }
}

printable_box();
