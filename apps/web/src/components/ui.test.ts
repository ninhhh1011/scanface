import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, csvCell, format } from "./ui";

afterEach(() => vi.unstubAllGlobals());
describe("UI API boundary", () => {
  it("keeps authenticated reads private and surfaces denied requests as errors", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "PERMISSION_DENIED", message: "Không có quyền" } }), { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    await expect(api("/api/hr/payroll")).rejects.toMatchObject({ code: "PERMISSION_DENIED", status: 403, message: "Không có quyền" });
    expect(fetch).toHaveBeenCalledWith("/api/hr/payroll", expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
  });
  it("does not treat a non-JSON server failure as a successful operation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Service error", { status: 503 })));
    await expect(api("/api/face/enroll", { method: "POST", body: "{}" })).rejects.toBeInstanceOf(ApiError);
  });
  it("formats integer VND without floating point loss and timestamps in Vietnam time", () => {
    expect(format("9007199254740993", "total_amount")).toBe("9.007.199.254.740.993 ₫");
    expect(format("2026-09-13T17:30:00Z", "check_in")).toContain("14/9/26");
    expect(format(null, "base_salary")).toBe("—");
    expect(csvCell(' =SUM(1,2)')).toBe('"\' =SUM(1,2)"');
    expect(csvCell('A "name"')).toBe('"A ""name"""');
  });
});
