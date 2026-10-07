import AttendanceTakeFixture from './AttendanceTakeFixture'

// A pack view that silently dropped a feature (the reset action) - the contract test must fail for it
export default function AttendanceTakeMissingReset(props) {
  return <AttendanceTakeFixture {...props} omit={['reset']} />
}
