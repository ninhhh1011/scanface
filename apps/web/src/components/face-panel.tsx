"use client";

import { Button, Checkbox } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { api, can, Choice, Confirm, ErrorNotice, format, Status, type Actor, type Row } from "./ui";

const outcomes: Record<string, string> = { NO_FACE: "Chưa thấy khuôn mặt. Hãy đứng trong khung hình và thử lại.", MULTIPLE_FACES: "Có nhiều người trong khung hình. Mỗi lượt chỉ dành cho một người.", LOW_QUALITY: "Ảnh chưa rõ. Hãy tăng ánh sáng, giữ camera ổn định và thử lại.", NO_ENROLLED_PROFILES: "Chưa có khuôn mặt đã đăng ký trong phạm vi của bạn. Vui lòng liên hệ HR.", UNKNOWN_PERSON: "Chưa thể xác nhận đây là khuôn mặt đã đăng ký. Không có bản ghi chấm công được tạo.", AMBIGUOUS_MATCH: "Kết quả chưa đủ rõ để xác nhận. Hãy thử lại hoặc liên hệ HR.", LIVENESS_FAILED: "Chuyển động chưa đáp ứng hướng dẫn. Hãy thử lại với lượt kiểm tra mới.", SERVICE_UNAVAILABLE: "Dịch vụ nhận diện hiện chưa sẵn sàng.", PERMISSION_DENIED: "Tài khoản không có quyền thực hiện thao tác này." };
type Challenge = { challenge_id: string; direction: "LEFT" | "RIGHT"; expires_at: string; instructions: string };
export function FacePanel({ actor, employeeId, profile, mode = "CHECK_IN", onSaved, employeeActive = true }: { actor: Actor; employeeId?: string; profile?: Row | null; mode?: "ENROLL" | "CHECK_IN"; onSaved?: () => void; employeeActive?: boolean }) {
  const [consent, setConsent] = useState(false), [camera, setCamera] = useState(false), [pending, setPending] = useState(false), [capturing, setCapturing] = useState(false), [error, setError] = useState<Error | null>(null), [message, setMessage] = useState(""), [result, setResult] = useState(""), [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [device, setDevice] = useState(""), [action, setAction] = useState<"CHECK_IN" | "CHECK_OUT">("CHECK_IN"), [removing, setRemoving] = useState(false);
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), generation = useRef(0), mounted = useRef(true), controller = useRef<AbortController | null>(null);
  const id = employeeId || actor.employee_id;
  function stop() { generation.current++; controller.current?.abort(); stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (video.current) video.current.srcObject = null; if (mounted.current) { setCamera(false); setCapturing(false); setPending(false); } }
  useEffect(() => { mounted.current = true; const hidden = () => { if (document.hidden) stop(); }; document.addEventListener("visibilitychange", hidden); return () => { mounted.current = false; stop(); document.removeEventListener("visibilitychange", hidden); }; }, []);
  async function start(deviceId = device) {
    stop(); const token = generation.current; setPending(true); setError(null); setMessage(""); setResult("");
    try {
      if (!consent) throw new Error("Cần sự đồng ý của người tham gia trước khi bật camera.");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Trình duyệt chưa hỗ trợ camera ở kết nối này. Hãy dùng HTTPS hoặc localhost.");
      let timedOut = false;
      const request = navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }), width: { ideal: 640 }, height: { ideal: 480 } } });
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error("Hết thời gian chờ camera. Kiểm tra quyền truy cập rồi thử lại.")); }, 12000); });
      request.then(value => { if (timedOut || token !== generation.current || !mounted.current) value.getTracks().forEach(track => track.stop()); }).catch(() => {});
      const active = await Promise.race([request, timeout]).finally(() => clearTimeout(timer));
      if (token !== generation.current || !mounted.current) { active.getTracks().forEach(track => track.stop()); return; }
      stream.current = active; if (video.current) { video.current.srcObject = active; await video.current.play(); }
      setCamera(true); setDevices((await navigator.mediaDevices.enumerateDevices()).filter(item => item.kind === "videoinput"));
    } catch (e) {
      stop(); const err = e as Error; setError(new Error(err.name === "NotAllowedError" ? "Quyền camera đã bị từ chối. Cho phép camera trong cài đặt trang rồi thử lại." : err.name === "NotFoundError" ? "Không tìm thấy camera trên thiết bị." : err.name === "NotReadableError" ? "Camera đang bận hoặc không thể mở. Hãy đóng ứng dụng đang sử dụng camera." : err.message));
    } finally { if (mounted.current) setPending(false); }
  }
  async function capture() {
    if (!camera || !consent || !id || capturing || !video.current) return;
    const token = generation.current; controller.current = new AbortController(); setCapturing(true); setError(null); setResult("");
    let frames: { image: string; captured_at: number }[] = [];
    try {
      const challenge = await api<Challenge>("/api/face/challenge", { method: "POST", body: JSON.stringify({ employee_id: id, action: mode === "ENROLL" ? "ENROLL" : action, consent: true }), signal: controller.current.signal });
      const challengeClock = performance.now(), serverStartedAt = Date.parse(challenge.expires_at) - 60_000;
      const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
      if (!context) throw new Error("Không thể xử lý ảnh trên trình duyệt này.");
      const width = video.current.videoWidth, height = video.current.videoHeight;
      if (!width || !height) throw new Error("Camera chưa có hình ảnh. Vui lòng thử lại.");
      canvas.width = Math.min(width, 640); canvas.height = Math.round(height * canvas.width / width);
      for (let index = 0; index < 9; index++) {
        if (generation.current !== token || !mounted.current) throw new DOMException("Đã dừng", "AbortError");
        setMessage(index < 3 ? "Nhìn thẳng vào camera" : index < 6 ? `Quay nhẹ đầu sang ${challenge.direction === "LEFT" ? "trái" : "phải"} của bạn` : "Trở lại nhìn thẳng vào camera");
        await new Promise(resolve => setTimeout(resolve, 650));
        if (!video.current || generation.current !== token) throw new DOMException("Đã dừng", "AbortError");
        context.drawImage(video.current, 0, 0, canvas.width, canvas.height);
        frames.push({ image: canvas.toDataURL("image/jpeg", .82).split(",")[1], captured_at: Math.round(serverStartedAt + performance.now() - challengeClock) });
      }
      setMessage("Đang xác minh khuôn mặt…");
      const response = await api<{ status: string; proof_id?: string }>(`/api/face/${mode === "ENROLL" ? "enroll" : "verify"}`, { method: "POST", body: JSON.stringify({ challenge_id: challenge.challenge_id, frames, ...(mode === "ENROLL" ? { employee_id: id } : {}) }), signal: controller.current.signal });
      frames = []; canvas.width = 0; canvas.height = 0;
      if (mode === "ENROLL" && response.status === "ENROLLED") { setResult("Đã đăng ký khuôn mặt và lưu hồ sơ thành công."); onSaved?.(); }
      else if (mode !== "ENROLL" && response.status === "MATCHED" && response.proof_id) {
        setMessage("Đã xác minh · Đang lưu chấm công…");
        await api("/api/face/attendance", { method: "POST", body: JSON.stringify({ proof_id: response.proof_id, action }), signal: controller.current.signal });
        setResult(action === "CHECK_IN" ? "Đã lưu chấm công vào ca." : "Đã lưu chấm công ra ca."); onSaved?.();
      } else setError(new Error(outcomes[response.status] || "Không thể hoàn tất xác minh. Vui lòng thử lại."));
    } catch (e) { if ((e as Error).name !== "AbortError") setError(e as Error); }
    finally { frames = []; stop(); if (mounted.current) setMessage(""); }
  }
  if (!id) return <section className="surface"><h2>Chưa có hồ sơ nhân viên</h2><p className="muted">Tài khoản cần được liên kết với hồ sơ nhân viên để chấm công.</p></section>;
  const enrollmentAllowed = can(actor, "hr:write") || actor.employee_id === id;
  return <section className="surface face-panel"><div className="stack"><div><span className="eyebrow">{mode === "ENROLL" ? "Hồ sơ khuôn mặt" : "Chấm công cá nhân"}</span><h2>{mode === "ENROLL" ? "Đăng ký khuôn mặt" : "Quét khuôn mặt"}</h2></div>{mode === "ENROLL" && <div className="actions"><Status value={profile?.status || "NOT_ENROLLED"} />{profile?.updated_at ? <span className="muted">Cập nhật {format(profile.updated_at, "updated_at")}</span> : null}</div>}<p className="muted">Khuôn mặt được dùng để đăng ký và xác minh chấm công. Mẫu sinh trắc học được mã hóa; ảnh và video không được lưu mặc định. Bạn có thể yêu cầu HR xóa hồ sơ khuôn mặt.</p><p className="muted">Kiểm tra yêu cầu nhìn thẳng, quay đầu theo hướng chỉ định rồi trở lại. Đây là kiểm tra chuyển động cơ bản, không bảo đảm chống mọi hình thức giả mạo.</p><Checkbox isSelected={consent} onChange={value => { setConsent(value); if (!value) stop(); }} isDisabled={capturing}><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control><Checkbox.Content>Tôi đồng ý xử lý khuôn mặt cho mục đích {mode === "ENROLL" ? "đăng ký chấm công" : "xác minh chấm công"} trong lượt này.</Checkbox.Content></Checkbox>{mode !== "ENROLL" && <Choice label="Thao tác chấm công" value={action} onChange={value => { stop(); setAction(value as "CHECK_IN" | "CHECK_OUT"); }} items={[{ id: "CHECK_IN", label: "Vào ca" }, { id: "CHECK_OUT", label: "Ra ca" }]} />}{devices.length > 1 && <Choice label="Camera" value={device} onChange={value => { setDevice(String(value)); if (camera) void start(String(value)); }} items={devices.map((item, i) => ({ id: item.deviceId, label: item.label || `Camera ${i + 1}` }))} />}<ErrorNotice error={error} />{result && <div className="notice success" role="status">{result}{mode !== "ENROLL" && <p><a className="text-link" href="/attendance">Xem lịch sử chấm công →</a></p>}</div>}{!employeeActive && <p className="field-error">Chỉ hồ sơ nhân viên đang hoạt động mới được đăng ký.</p>}<div className="actions">{!camera ? <Button isDisabled={!consent || !employeeActive || (mode === "ENROLL" && !enrollmentAllowed)} isPending={pending} onPress={() => start()}>Bật camera</Button> : <><Button isPending={capturing} onPress={capture}>{mode === "ENROLL" ? profile ? "Đăng ký lại" : "Bắt đầu đăng ký" : `Xác minh ${action === "CHECK_IN" ? "vào ca" : "ra ca"}`}</Button><Button variant="secondary" onPress={stop}>Dừng camera</Button></>}{mode === "ENROLL" && profile && enrollmentAllowed && <Button variant="outline" onPress={() => { stop(); setRemoving(true); }}>Xóa hồ sơ khuôn mặt</Button>}</div></div><div className="camera-stage"><video ref={video} playsInline muted autoPlay className={camera ? "" : "camera-inactive"} aria-label="Hình ảnh trực tiếp từ camera" />{!camera && <div className="camera-placeholder"><span aria-hidden="true">◎</span><p>Camera đang tắt</p><span>Chỉ bật khi bạn sẵn sàng.</span></div>}{message && <div className="camera-instruction" role="status" aria-live="assertive">{message}</div>}</div>{removing && <Confirm title="Xóa hồ sơ khuôn mặt" description="Mẫu khuôn mặt và quyền xác minh liên quan sẽ bị xóa. Bạn cần đăng ký lại để chấm công bằng khuôn mặt." onClose={() => setRemoving(false)} onConfirm={async () => { await api(`/api/face/profiles/${id}`, { method: "DELETE" }); setResult("Đã xóa hồ sơ khuôn mặt."); onSaved?.(); }} />}</section>;
}
