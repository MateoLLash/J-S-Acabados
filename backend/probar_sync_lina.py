import getpass
import httpx

base = "https://j-s-acabados.onrender.com"

correo = input("Correo de tu cuenta: ").strip()
clave = getpass.getpass("Contraseña: ")

try:
    with httpx.Client(timeout=120.0) as client:
        login = client.post(
            f"{base}/auth/login",
            json={"email": correo, "password": clave},
        )

        if login.status_code != 200:
            print("Error de login:", login.status_code)
            print(login.text)
        else:
            token = login.json().get("access_token")
            if not token:
                print("El login no devolvió access_token.")
            else:
                respuesta = client.post(
                    f"{base}/api/v1/sync/lina/productos",
                    headers={"Authorization": f"Bearer {token}"},
                )
                print("Backend consultado:", base)
                print("Estado:", respuesta.status_code)
                print("Respuesta:", respuesta.text)
except httpx.RequestError as error:
    print("Error de conexión:", error)
