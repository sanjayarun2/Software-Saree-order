package com.sareeorder.app;

import android.graphics.Bitmap;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.util.concurrent.TimeUnit;

public final class SnipOcrHelper {
    private SnipOcrHelper() {}

    @NonNull
    public static String recognize(@Nullable Bitmap bitmap) throws Exception {
        if (bitmap == null || bitmap.isRecycled() || bitmap.getWidth() < 8 || bitmap.getHeight() < 8) {
            return "";
        }
        TextRecognizer recognizer =
            TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        try {
            InputImage image = InputImage.fromBitmap(bitmap, 0);
            Text result = Tasks.await(recognizer.process(image), 20, TimeUnit.SECONDS);
            String text = result != null ? result.getText() : "";
            return text != null ? text.trim() : "";
        } finally {
            recognizer.close();
        }
    }
}
