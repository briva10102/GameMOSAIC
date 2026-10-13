import { Navigate, Route, Routes } from 'react-router-dom';
import MissionSetup from './pages/MissionSetup';
import MissionControl from './pages/MissionControl';
import AdminDashboard from './pages/AdminDashboard';
export default function App(){return <Routes><Route path="/" element={<MissionSetup/>}/><Route path="/mission/:id" element={<MissionControl/>}/><Route path="/admin" element={<AdminDashboard/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>}
