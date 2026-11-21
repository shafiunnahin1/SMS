import { RequireDepartment } from '../../features/staff/StaffDepartment'
import Scholarships from '../scholarship/Scholarships'
import Visitors from '../visitor/Visitors'
import Competitions from '../event/Competitions'
import Alumni from '../alumni/Alumni'
import OnlineClasses from '../online-class/OnlineClasses'
import Library from '../library/Library'
import Transport from '../transport/Transport'
import Hostel from '../hostel/Hostel'
import Meetings from '../meeting/Meetings'
import Health from '../health/Health'
import Behavior from '../behavior/Behavior'

// D227 / D229 / D231 (follow-up): the staff pages ask for a department first (D169: the choice lives in memory only, so a reload asks
// again) and open only with the read key; the controls inside follow the manage / circulate keys (useStaffCan)
export const StaffOnlineClasses = () => <RequireDepartment permission="staff.online_class.read"><OnlineClasses /></RequireDepartment>
export const StaffLibrary = () => <RequireDepartment permission="staff.library.read"><Library /></RequireDepartment>
export const StaffTransport = () => <RequireDepartment permission="staff.transport.read"><Transport /></RequireDepartment>
export const StaffHostel = () => <RequireDepartment permission="staff.hostel.read"><Hostel /></RequireDepartment>   // D233 HST.2
export const StaffMeetings = () => <RequireDepartment permission="staff.meeting.read"><Meetings /></RequireDepartment>   // D235 MTG.2
export const StaffHealth = () => <RequireDepartment permission="staff.health.read"><Health /></RequireDepartment>   // D235 HLT.2
export const StaffBehavior = () => <RequireDepartment permission="staff.behavior.read"><Behavior /></RequireDepartment>   // D235 BHV.2
export const StaffScholarships = () => <RequireDepartment permission="staff.scholarship.read"><Scholarships /></RequireDepartment>   // D236 SCH.3
export const StaffVisitors = () => <RequireDepartment permission="staff.visitor.read"><Visitors /></RequireDepartment>   // D240 VIS.2
export const StaffCompetitions = () => <RequireDepartment permission="staff.event.read"><Competitions /></RequireDepartment>   // D242 EVT.2
export const StaffAlumni = () => <RequireDepartment permission="staff.alumni.read"><Alumni /></RequireDepartment>   // D243 ALM.2
