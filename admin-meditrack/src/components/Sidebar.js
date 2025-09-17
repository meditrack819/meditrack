import React from 'react';
import { Drawer, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import EventIcon from '@mui/icons-material/Event';
import InventoryIcon from '@mui/icons-material/Inventory';
import { Link } from 'react-router-dom';

const Sidebar = () => {
  return (
    <Drawer variant="permanent" anchor="left">
      <List>
        <ListItemButton component={Link} to="/">
          <ListItemIcon><DashboardIcon /></ListItemIcon>
          <ListItemText primary="Dashboard" />
        </ListItemButton>
        <ListItemButton component={Link} to="/patients">
          <ListItemIcon><PeopleIcon /></ListItemIcon>
          <ListItemText primary="Patients" />
        </ListItemButton>
        <ListItemButton component={Link} to="/calendar">
          <ListItemIcon><EventIcon /></ListItemIcon>
          <ListItemText primary="Calendar" />
        </ListItemButton>
        <ListItemButton component={Link} to="/stock">
          <ListItemIcon><InventoryIcon /></ListItemIcon>
          <ListItemText primary="Stock" />
        </ListItemButton>
      </List>
    </Drawer>
  );
};

export default Sidebar;
