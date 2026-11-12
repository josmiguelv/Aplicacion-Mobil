package com.integrab2g.pollosb3

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.integrab2g.pollosb3.ui.BrandPalette
import com.integrab2g.pollosb3.ui.PollosB3App
import com.integrab2g.pollosb3.ui.PollosB3Splash
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            var loading by remember { mutableStateOf(true) }
            LaunchedEffect(Unit) {
                delay(1400)
                loading = false
            }
            Surface(modifier = Modifier.fillMaxSize(), color = BrandPalette.White) {
                if (loading) PollosB3Splash() else PollosB3App()
            }
        }
    }
}
