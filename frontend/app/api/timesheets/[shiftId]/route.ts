export async function GET(
    request: Request,
    { params }: { params: { shiftId: string } }
) {
    // Mock timesheet data — replace with real FlexStaff DB query later
    return Response.json({ hoursWorked: 8 });
}