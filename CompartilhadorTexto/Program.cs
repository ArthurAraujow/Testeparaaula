// ============================================================
//  COMPARTILHADOR DE TEXTO - Servidor Local
//
//  Para usar em sala de aula:
//    1. Execute este programa (dotnet run)
//    2. O professor acessa: http://localhost:5000/admin
//    3. Os alunos acessam:  http://SEU_IP:5000/view
//
//  O endereço IP será exibido no console ao iniciar.
// ============================================================

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromHours(8);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
});

var app = builder.Build();

const string PROFESSOR_USUARIO = "Professor";
const string PROFESSOR_SENHA   = "ceub123456";
const int    PORTA             = 5000;

app.UseSession();

app.Use(async (context, next) =>
{
    var path = (context.Request.Path.Value ?? "").ToLower();

    if (path == "/admin") { context.Response.Redirect("/admin.html"); return; }
    if (path == "/login") { context.Response.Redirect("/login.html"); return; }
    if (path == "/view")  { context.Response.Redirect("/view.html");  return; }

    bool isLocal = IsLocalRequest(context);

    bool isProtectedPage = path == "/admin.html" || path == "/login.html";
    bool isProtectedApi  = path.StartsWith("/api/login") ||
                           path.StartsWith("/api/logout") ||
                           path.StartsWith("/api/auth") ||
                           path == "/api/text" ||
                           path.StartsWith("/api/info");

    if (!isLocal && (isProtectedPage || isProtectedApi))
    {
        if (isProtectedApi)
        {
            context.Response.StatusCode = 403;
            await context.Response.WriteAsJsonAsync(new { error = "Acesso restrito ao servidor local" });
            return;
        }
        context.Response.Redirect("/view.html");
        return;
    }

    if (path == "/admin.html" && context.Session.GetString("auth") != "true")
    {
        context.Response.Redirect("/login.html");
        return;
    }

    await next();
});

static bool IsLocalRequest(HttpContext context)
{
    var remoteIp = context.Connection.RemoteIpAddress;
    if (remoteIp == null) return false;

    if (System.Net.IPAddress.IsLoopback(remoteIp)) return true;

    var localIp = context.Connection.LocalIpAddress;
    if (localIp != null && remoteIp.Equals(localIp)) return true;

    return false;
}

app.UseDefaultFiles();
app.UseStaticFiles();

var textLock     = new object();
var textFilePath = Path.Combine(app.Environment.ContentRootPath, "texto_compartilhado.txt");
var sharedText   = File.Exists(textFilePath) ? File.ReadAllText(textFilePath) : "";

app.MapPost("/api/login", async (HttpContext ctx) =>
{
    using var reader = new StreamReader(ctx.Request.Body);
    var body = await reader.ReadToEndAsync();
    var data = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(body);

    if (data != null &&
        data.TryGetValue("username", out var user) &&
        data.TryGetValue("password", out var pass) &&
        user == PROFESSOR_USUARIO && pass == PROFESSOR_SENHA)
    {
        ctx.Session.SetString("auth", "true");
        return Results.Json(new { success = true });
    }

    return Results.Json(new { success = false, message = "Usuário ou senha incorretos" });
});

app.MapPost("/api/logout", (HttpContext ctx) =>
{
    ctx.Session.Clear();
    return Results.Json(new { success = true });
});

app.MapGet("/api/auth/check", (HttpContext ctx) =>
{
    var isAuth = ctx.Session.GetString("auth") == "true";
    return Results.Json(new { authenticated = isAuth });
});

app.MapGet("/api/text", (HttpContext ctx) =>
{
    if (ctx.Session.GetString("auth") != "true")
        return Results.Unauthorized();

    lock (textLock)
    {
        return Results.Json(new { text = sharedText });
    }
});

app.MapPost("/api/text", async (HttpContext ctx) =>
{
    if (ctx.Session.GetString("auth") != "true")
        return Results.Unauthorized();

    using var reader = new StreamReader(ctx.Request.Body);
    var body = await reader.ReadToEndAsync();
    var data = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(body);

    if (data != null && data.TryGetValue("text", out var text))
    {
        lock (textLock) { sharedText = text; }
        await File.WriteAllTextAsync(textFilePath, text);
        return Results.Json(new { success = true });
    }

    return Results.BadRequest(new { message = "Texto não fornecido" });
});

app.MapGet("/api/text/shared", (HttpContext ctx) =>
{
    lock (textLock)
    {
        return Results.Json(new { text = sharedText });
    }
});

app.MapGet("/api/info", (HttpContext ctx) =>
{
    if (ctx.Session.GetString("auth") != "true")
        return Results.Unauthorized();

    var addresses = System.Net.Dns.GetHostAddresses(System.Net.Dns.GetHostName())
        .Where(a => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
        .Select(a => a.ToString())
        .ToList();

    return Results.Json(new { addresses, port = PORTA });
});

Console.WriteLine();
Console.WriteLine("╔══════════════════════════════════════════════════════╗");
Console.WriteLine("║        COMPARTILHADOR DE TEXTO - SERVIDOR           ║");
Console.WriteLine("╠══════════════════════════════════════════════════════╣");
Console.WriteLine($"║  Porta: {PORTA}                                         ║");
Console.WriteLine($"║  Professor: http://localhost:{PORTA}/admin               ║");

try
{
    var addresses = System.Net.Dns.GetHostAddresses(System.Net.Dns.GetHostName())
        .Where(a => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
        .Select(a => a.ToString())
        .ToList();

    foreach (var addr in addresses)
    {
        var url = $"http://{addr}:{PORTA}/view";
        Console.WriteLine($"║  Alunos: {url.PadRight(43)}║");
    }
}
catch { }

Console.WriteLine("╠══════════════════════════════════════════════════════╣");
Console.WriteLine($"║  Usuário: {PROFESSOR_USUARIO.PadRight(42)}║");
Console.WriteLine($"║  Senha:   {PROFESSOR_SENHA.PadRight(42)}║");
Console.WriteLine("╚══════════════════════════════════════════════════════╝");
Console.WriteLine();
Console.WriteLine("  Pressione Ctrl+C para parar o servidor.");
Console.WriteLine();

app.Run($"http://0.0.0.0:{PORTA}");
