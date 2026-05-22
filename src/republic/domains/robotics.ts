import type { SeedDomain } from "./seed-data.js";

export const roboticsDomains: SeedDomain[] = [
  {
    path: "Engineering.Robotics",
    name: "Robotics",
    description: "Design, programming, and deployment of robotic systems",
    coreSkills: [
      "kinematics",
      "ros-development",
      "sensor-fusion",
      "motion-planning",
      "actuator-control",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Engineering.Robotics.ComputerVision",
    name: "Computer Vision",
    description: "Image recognition, object detection, and visual perception for robots",
    coreSkills: [
      "object-detection",
      "image-segmentation",
      "depth-estimation",
      "visual-slam",
      "feature-extraction",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Engineering.Robotics.AutonomousNavigation",
    name: "Autonomous Navigation",
    description: "Path planning, SLAM, and obstacle avoidance for autonomous vehicles",
    coreSkills: [
      "path-planning",
      "slam-algorithms",
      "obstacle-avoidance",
      "gps-fusion",
      "lidar-processing",
    ],
    minPracticeLevel: "master",
  },
];
