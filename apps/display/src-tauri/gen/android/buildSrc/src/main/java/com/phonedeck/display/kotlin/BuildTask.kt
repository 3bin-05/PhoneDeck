import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction
import javax.inject.Inject
import org.gradle.process.ExecOperations

abstract class BuildTask : DefaultTask() {
    @get:Inject
    abstract val execOperations: ExecOperations

    @Input
    var rootDirRel: String? = null
    @Input
    var projectDir: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val executable = """pnpm""";
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                // Try different Windows-specific extensions
                val fallbacks = listOf(
                    "$executable.exe",
                    "$executable.cmd",
                    "$executable.bat",
                )

                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                if (fallbackCopySoIfBuilt()) {
                    return
                }
                throw lastException
            } else {
                throw e;
            }
        }
    }

    private fun fallbackCopySoIfBuilt(): Boolean {
        val targetName = target ?: return false
        val isRel = release ?: false
        val profile = if (isRel) "release" else "debug"
        val triple = when (targetName) {
            "aarch64" -> "aarch64-linux-android"
            "armv7" -> "armv7-linux-androideabi"
            "i686" -> "i686-linux-android"
            "x86_64" -> "x86_64-linux-android"
            else -> targetName
        }
        val abi = when (targetName) {
            "aarch64" -> "arm64-v8a"
            "armv7" -> "armeabi-v7a"
            "i686" -> "x86"
            "x86_64" -> "x86_64"
            else -> targetName
        }
        val proj = File(projectDir ?: return false)
        val dstDir = File(proj, "src/main/jniLibs/$abi")
        val dstSo = File(dstDir, "libdisplay_lib.so")

        val candidateLocations = listOf(
            File("D:/PhoneDeck/target/$triple/$profile/libdisplay_lib.so"),
            File(proj, "../../../../../target/$triple/$profile/libdisplay_lib.so"),
            File(proj, "../../../target/$triple/$profile/libdisplay_lib.so"),
            File(proj, "../../../../target/$triple/$profile/libdisplay_lib.so")
        )
        val srcSo = candidateLocations.firstOrNull { it.exists() && it.length() > 0 }
        if (dstSo.exists() && dstSo.length() > 0) {
            if (srcSo == null || dstSo.lastModified() >= srcSo.lastModified()) {
                println("PhoneDeck BuildTask: using existing up-to-date jniLibs so at $dstSo (${dstSo.length()} bytes)")
                return true
            }
        }
        if (srcSo != null) {
            dstDir.mkdirs()
            try {
                java.nio.file.Files.copy(
                    srcSo.toPath(),
                    dstSo.toPath(),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING
                )
                println("PhoneDeck BuildTask: copied fresh $srcSo to $dstSo (${dstSo.length()} bytes)")
            } catch (e: Exception) {
                println("PhoneDeck BuildTask: copy exception (may already be in use): ${e.message}")
            }
            return dstSo.exists() && dstSo.length() > 0
        }
        println("PhoneDeck BuildTask: no candidate .so found for $triple/$profile in $candidateLocations")
        return false
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("tauri", "android", "android-studio-script");

        execOperations.exec {
            workingDir(File(projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}