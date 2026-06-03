import { signToken } from "../../server/src/routes/sso";

export const TEST_LOCATION_ID = "loc-test-001";

export function makeAuthHeader(locationId = TEST_LOCATION_ID): string {
  const token = signToken({ locationId, userId: "user-test", role: "admin" });
  return `Bearer ${token}`;
}
