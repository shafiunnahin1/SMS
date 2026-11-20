import { RequireDepartment } from '../../features/staff/StaffDepartment'
import OnlineClasses from '../online-class/OnlineClasses'
import Library from '../library/Library'
import Transport from '../transport/Transport'
import Hostel from '../hostel/Hostel'
import Meetings from '../meeting/Meetings'
import Health from '../health/Health'

// D227 / D229 / D231 (follow-up): the staff pages ask for a department first (D169: the choice lives in memory only, so a reload asks
// again) and open only with the read key; the controls inside follow the manage / circulate keys (useStaffCan)
export const StaffOnlineClasses = () => <RequireDepartment permission="staff.online_class.read"><OnlineClasses /></RequireDepartment>
export const StaffLibrary = () => <RequireDepartment permission="staff.library.read"><Library /></RequireDepartment>
export const StaffTransport = () => <RequireDepartment permission="staff.transport.read"><Transport /></RequireDepartment>
export const StaffHostel = () => <RequireDepartment permission="staff.hostel.read"><Hostel /></RequireDepartment>   // D233 HST.2
export const StaffMeetings = () => <RequireDepartment permission="staff.meeting.read"><Meetings /></RequireDepartment>   // D235 MTG.2
export const StaffHealth = () => <RequireDepartment permission="staff.health.read"><Health /></RequireDepartment>   // D235 HLT.2
