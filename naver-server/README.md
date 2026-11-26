# 자리바꾸기 네이버 인증 서버

이 서버는 기존 `https://change-seat-c.onrender.com`의 네이버 로그인 팝업을 처리합니다. 네이버의 기본 이용자 식별자로 Firebase 계정을 구분합니다.

1. 서버 폴더를 별도 GitHub 저장소에 올린 뒤 Render에서 **Web Service**로 연결합니다. Build Command는 `npm install`, Start Command는 `npm start`입니다.
2. Render에서 정해진 서버 주소 뒤에 `/auth/naver/callback`을 붙여 네이버 개발자센터의 Callback URL과 Render 환경 변수 `NAVER_CALLBACK_URL`에 같은 값으로 입력합니다. 네이버의 서비스 URL은 `https://change-seat-c.onrender.com`입니다.
3. `.env.example`의 변수 이름을 참고해 Render에서 네이버 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 및 임의 생성한 32자 이상 `OAUTH_STATE_SECRET`을 설정합니다. `SITE_ORIGIN`은 기존 자리바꾸기 주소를 사용합니다.
4. Render의 Secret Files에 전용 Firebase 서비스 계정 자격 증명을 `firebase-service-account.json`으로 등록하고 `GOOGLE_APPLICATION_CREDENTIALS`를 `/etc/secrets/firebase-service-account.json`으로 설정합니다. 네이버 Client Secret과 서비스 계정 파일은 공개 저장소에 올리면 안 됩니다.
5. 자리바꾸기 소스의 `src/naverLogin.js`에 서버 주소와 같은 Firebase 프로젝트의 공개 웹 앱 설정을 입력하고 `npm run build`를 실행합니다. 만들어진 `index.html`을 기존 자리바꾸기 저장소에 반영한 뒤 실제 사이트에서 네이버 로그인과 로그아웃을 확인합니다.

신규 로그인 계정은 기존 계정과 자동으로 합쳐지지 않습니다. Render 서비스가 준비되기 전에는 로그인 버튼이 숨겨져 있습니다.
